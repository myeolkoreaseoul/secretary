import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { callClaude } from "@/lib/claude";
import type { TutorRequest, TutorResponse } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set(["user", "assistant"]);

const TUTOR_SYSTEM_PROMPT = `당신은 코딩 과외 선생님입니다. 사용자가 AI 대화 로그의 특정 부분을 선택하고 질문하면, 그 맥락을 기반으로 쉽고 친절하게 설명해 주세요.

규칙:
- 한국어로 답변하세요.
- 선택된 텍스트가 있으면 그것을 중심으로, 없으면 대화 전체 맥락을 기반으로 답변하세요.
- 코드가 포함된 경우 코드 블록으로 감싸고, 각 줄이 무엇을 하는지 설명하세요.
- 전문 용어가 나오면 간단한 비유나 예시로 풀어 설명하세요.
- 관련 개념이 있으면 related_concepts로 알려주세요.
- 답변은 마크다운 형식으로 작성하세요.`;

export async function POST(request: NextRequest) {
  // JSON 파싱 실패 방어
  let body: TutorRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 형식입니다" }, { status: 400 });
  }

  try {
    const { conversation_id, message_id, selected_text, question, history } = body;

    // UUID 형식 검증
    if (!conversation_id || !UUID_RE.test(conversation_id)) {
      return NextResponse.json({ error: "유효하지 않은 conversation_id" }, { status: 400 });
    }
    if (message_id && !UUID_RE.test(message_id)) {
      return NextResponse.json({ error: "유효하지 않은 message_id" }, { status: 400 });
    }
    if (!question) {
      return NextResponse.json({ error: "question은 필수입니다" }, { status: 400 });
    }

    // 입력 크기 제한
    if (question.length > 2000) {
      return NextResponse.json({ error: "질문이 너무 깁니다 (최대 2000자)" }, { status: 400 });
    }
    if (selected_text && selected_text.length > 5000) {
      return NextResponse.json({ error: "선택 텍스트가 너무 깁니다 (최대 5000자)" }, { status: 400 });
    }
    if (history && history.length > 20) {
      return NextResponse.json({ error: "대화 이력이 너무 깁니다 (최대 20턴)" }, { status: 400 });
    }
    if (history && history.some((m) => !ALLOWED_ROLES.has(m.role) || m.content.length > 10000)) {
      return NextResponse.json({ error: "이력에 잘못된 role 또는 너무 긴 메시지가 포함되어 있습니다" }, { status: 400 });
    }

    // 대화 메타 조회
    const { data: conversation } = await supabaseAdmin
      .from("ai_conversations")
      .select("id, provider, title, model, project_path")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });
    }

    // 맥락 메시지 조회: message_id 기준 주변 5개, 없으면 최근 10개
    let contextMessages: { role: string; content: string }[] = [];

    if (message_id) {
      // 해당 메시지의 시간 조회 (conversation_id 스코프 포함)
      const { data: targetMsg } = await supabaseAdmin
        .from("ai_messages")
        .select("message_at")
        .eq("id", message_id)
        .eq("conversation_id", conversation_id)
        .single();

      if (targetMsg) {
        // 앞 2개 + 본인: descending으로 가져와서 reverse
        const { data: before } = await supabaseAdmin
          .from("ai_messages")
          .select("role, content")
          .eq("conversation_id", conversation_id)
          .order("message_at", { ascending: false })
          .gte("message_at", targetMsg.message_at)
          .limit(3);

        // 뒤 2개
        const { data: after } = await supabaseAdmin
          .from("ai_messages")
          .select("role, content")
          .eq("conversation_id", conversation_id)
          .order("message_at", { ascending: true })
          .gt("message_at", targetMsg.message_at)
          .limit(2);

        contextMessages = [
          ...((before || []).reverse()),
          ...(after || []),
        ].map((m) => ({ role: m.role, content: m.content || "" }));
      }
    }

    if (contextMessages.length === 0) {
      // 최근 10개: descending으로 가져와서 reverse (시간순 정렬)
      const { data: recent } = await supabaseAdmin
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("message_at", { ascending: false })
        .limit(10);

      contextMessages = ((recent || []).reverse()).map((m) => ({
        role: m.role,
        content: m.content || "",
      }));
    }

    // 프롬프트 구성
    const contextBlock = contextMessages
      .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join("\n---\n");

    const metaBlock = [
      `프로젝트: ${conversation.project_path || "알 수 없음"}`,
      `모델: ${conversation.model || "알 수 없음"}`,
      `도구: ${conversation.provider}`,
    ].join("\n");

    let userPrompt = `## 대화 맥락\n${metaBlock}\n\n${contextBlock}`;

    if (selected_text) {
      userPrompt += `\n\n## 선택된 텍스트\n\`\`\`\n${selected_text}\n\`\`\``;
    }

    userPrompt += `\n\n## 질문\n${question}`;

    // 멀티턴: history가 있으면 이전 과외 대화도 포함 (role 화이트리스트 적용)
    let input: string | { role: string; content: string }[];
    if (history && history.length > 0) {
      const sanitizedHistory = history
        .filter((m) => ALLOWED_ROLES.has(m.role))
        .map((m) => ({ role: m.role, content: m.content.slice(0, 10000) }));
      input = [
        ...sanitizedHistory,
        { role: "user", content: userPrompt },
      ];
    } else {
      input = userPrompt;
    }

    const answer = await callClaude(TUTOR_SYSTEM_PROMPT, input);

    const response: TutorResponse = { answer };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Tutor API error:", error);
    return NextResponse.json(
      { error: "과외 응답 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
