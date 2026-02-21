import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM_PROMPT = `당신은 "Secretary"라는 AI 비서입니다. 사용자의 개인 업무, 생활, 프로젝트를 관리합니다.

## 역할
- 질문에 답하고, 조언을 제공합니다
- 할일, 시간 관리, 일정 등을 도와줍니다
- 한국어로 대화합니다
- 간결하고 실용적인 답변을 합니다

## 슬래시 명령어 (사용자가 사용 시)
- /todo [내용]: 할일로 추가
- /time [시간] [카테고리]: 시간 기록
- /search [쿼리]: 이전 대화 검색

## 규칙
- 답변은 200자 이내로 간결하게
- 실행 가능한 조언 위주
- 이모지는 최소한으로 사용`;

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Handle slash commands
    const todoMatch = message.match(/^\/todo\s+(.+)/);
    if (todoMatch) {
      const title = todoMatch[1].trim();
      await supabaseAdmin
        .from("todos")
        .insert({ title, source: "web-chat", priority: 0 });

      const reply = `할일 추가됨: "${title}"`;
      await saveMessages(message, reply);
      return NextResponse.json({ reply, action: "todo_added", title });
    }

    const timeMatch = message.match(/^\/time\s+(\S+)\s+(.+)/);
    if (timeMatch) {
      const duration = timeMatch[1];
      const category = timeMatch[2].trim();
      const hours = parseFloat(duration.replace(/h/i, ""));

      if (!isNaN(hours)) {
        const now = new Date();
        const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

        await supabaseAdmin.from("activity_logs").insert({
          window_title: category,
          app_name: "manual",
          category,
          recorded_at: start.toISOString(),
        });

        const reply = `${hours}시간 "${category}" 기록 완료`;
        await saveMessages(message, reply);
        return NextResponse.json({
          reply,
          action: "time_logged",
          hours,
          category,
        });
      }
    }

    const searchMatch = message.match(/^\/search\s+(.+)/);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      const { data: results } = await supabaseAdmin
        .from("telegram_messages")
        .select("content, role, created_at")
        .eq("chat_id", 0)
        .ilike("content", `%${escapeIlike(query)}%`)
        .order("created_at", { ascending: false })
        .limit(5);

      const reply =
        results && results.length > 0
          ? `검색 결과 (${results.length}건):\n${results
              .map(
                (r) =>
                  `- [${r.role === "user" ? "나" : "비서"}] ${r.content.slice(0, 50)}...`
              )
              .join("\n")}`
          : `"${query}"에 대한 검색 결과가 없습니다`;

      await saveMessages(message, reply);
      return NextResponse.json({ reply, action: "search", results });
    }

    // Regular conversation - call Claude
    // Fetch recent conversation history (web chat only: chat_id=0)
    const { data: history } = await supabaseAdmin
      .from("telegram_messages")
      .select("role, content")
      .eq("chat_id", 0)
      .order("created_at", { ascending: false })
      .limit(20);

    const messages: Anthropic.MessageParam[] = [];
    if (history && history.length > 0) {
      // Add history in chronological order
      for (const msg of history.reverse()) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const reply = textBlock ? textBlock.text : "응답을 생성할 수 없습니다.";

    // Save both messages and get the user message ID
    const userMessageId = await saveMessages(message, reply);

    // Classify the message using Gemini (non-blocking)
    classifyAndUpdate(message, userMessageId).catch(() => {});

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

async function saveMessages(userMsg: string, assistantMsg: string): Promise<string | null> {
  const chatId = 0; // Web chat uses chat_id = 0

  const { data } = await supabaseAdmin.from("telegram_messages").insert([
    {
      chat_id: chatId,
      sender: "web",
      role: "user",
      content: userMsg,
      metadata: { source: "web" },
    },
    {
      chat_id: chatId,
      sender: "secretary",
      role: "assistant",
      content: assistantMsg,
      metadata: { source: "web" },
    },
  ]).select("id");

  // Return the user message ID (first inserted row)
  return data && data.length > 0 ? data[0].id : null;
}

async function classifyAndUpdate(message: string, messageId: string | null) {
  try {
    const { callGemini } = await import("@/lib/gemini");
    const prompt = `다음 메시지의 카테고리를 하나 골라주세요: 업무, 소개팅비즈니스, 온라인판매, 건강, 가족, 개발, 기타
메시지: "${message}"
JSON으로 응답: {"category": "카테고리명", "title": "20자이내 제목", "summary": "50자이내 요약"}`;

    const result = await callGemini(prompt, message);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const classification = JSON.parse(jsonMatch[0]);

      if (messageId) {
        // Directly update using the known message ID
        await supabaseAdmin
          .from("telegram_messages")
          .update({ classification })
          .eq("id", messageId);
      } else {
        // Fallback: find the most recent user message
        const { data: recent } = await supabaseAdmin
          .from("telegram_messages")
          .select("id")
          .eq("chat_id", 0)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (recent) {
          await supabaseAdmin
            .from("telegram_messages")
            .update({ classification })
            .eq("id", recent.id);
        }
      }
    }
  } catch {
    // Classification is non-critical
  }
}
