import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { streamGemini } from "@/lib/gemini";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

interface Sentence {
  num: number;
  timestamp: string;
  text: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const { video_id } = await params;

  let body: { message: string; history: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { message, history = [] } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: "메시지가 비어있습니다" }, { status: 400 });
  }

  // 영상 데이터 로드
  const { data: video, error } = await supabaseAdmin
    .from("yt_summaries")
    .select("title, channel, sentences, summary_json")
    .eq("video_id", video_id)
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "영상을 찾을 수 없습니다" }, { status: 404 });
  }

  // 릴레이 프록시 (VIVO_RELAY_URL 설정 시 VivoBook 릴레이로 위임)
  const VIVO_RELAY_URL = process.env.VIVO_RELAY_URL;
  const RELAY_SECRET = process.env.RELAY_SECRET;

  if (VIVO_RELAY_URL && RELAY_SECRET) {
    let relayRes: Response;
    try {
      relayRes = await fetch(`${VIVO_RELAY_URL}/api/yt/${video_id}/chat-relay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Relay-Secret": RELAY_SECRET,
        },
        body: JSON.stringify({
          message,
          history,
          title: video.title,
          channel: video.channel,
          sentences: video.sentences,
          summary_json: video.summary_json,
        }),
      });
    } catch (fetchErr) {
      console.error("릴레이 fetch 오류:", fetchErr);
      return NextResponse.json({ error: "릴레이 서버에 연결할 수 없습니다" }, { status: 502 });
    }

    if (!relayRes.ok || !relayRes.body) {
      console.error("릴레이 응답 오류:", relayRes.status);
      return NextResponse.json({ error: "릴레이 서버 오류" }, { status: 502 });
    }

    // SSE 스트림 그대로 파이프 (투명 프록시)
    return new Response(relayRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // 자막 텍스트 구성
  const transcriptText = Array.isArray(video.sentences) && video.sentences.length > 0
    ? video.sentences
        .map((s: Sentence) => `[${s.num}] ${s.timestamp} ${s.text}`)
        .join("\n")
    : "(자막 없음)";

  // 요약 정보 구성 (자막이 없는 경우를 위한 보조 맥락)
  let summaryText = "";
  if (video.summary_json && typeof video.summary_json === 'object') {
    const s = video.summary_json as any;
    if (s.summary?.key_questions) {
      summaryText += "\n## 핵심 질문 및 답변\n";
      s.summary.key_questions.forEach((q: any) => {
        summaryText += `Q: ${q.question}\nA: ${q.answer}\n`;
      });
    }
    if (s.summary?.toc) {
      summaryText += "\n## 목차\n";
      s.summary.toc.forEach((t: any) => {
        summaryText += `${t.number}. ${t.title}\n`;
      });
    }
  }

  // 대화 기록 구성
  const historyText = history.length > 0
    ? history.map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`).join("\n") + "\n\n"
    : "";

  // 프롬프트 구성
  const systemPrompt = `당신은 YouTube 영상 AI 도우미입니다. 아래 영상 내용을 기반으로 질문에 답하세요.

## 영상 정보
제목: ${video.title}
채널: ${video.channel}

## 영상 핵심 요약${summaryText || "\n(요약 정보 없음)"}

## 전체 자막
${transcriptText}

---
위 내용을 바탕으로 사용자의 질문에 한국어로 간결하게 답하세요. 자막의 특정 문장을 인용할 때는 문장 번호([N])를 포함하세요. 자막이 없는 경우 제공된 요약 정보를 최대한 활용하세요.`;

  const userMessage = `${historyText}사용자: ${message}`;

  const enc = new TextEncoder();

  try {
    const stream = await streamGemini(systemPrompt, userMessage);

    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ chunk: text })}\n\n`));
            }
          }
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (streamErr) {
          console.error("Gemini stream error:", streamErr);
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: "스트리밍 중 오류가 발생했습니다" })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (genErr) {
    console.error("Gemini SDK error:", genErr);
    return NextResponse.json({ error: "Gemini API 호출 중 오류가 발생했습니다" }, { status: 500 });
  }
}
