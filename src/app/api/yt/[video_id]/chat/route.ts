import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { spawn } from "child_process";

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

  // 대화 기록 구성
  const historyText = history.length > 0
    ? history.map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`).join("\n") + "\n\n"
    : "";

  // 프롬프트 구성
  const prompt = `당신은 YouTube 영상 AI 도우미입니다. 아래 영상 내용을 기반으로 질문에 답하세요.

## 영상 정보
제목: ${video.title}
채널: ${video.channel}

## 전체 자막
${transcriptText}

---
${historyText}사용자: ${message}

위 질문에 한국어로 간결하게 답하세요. 자막의 특정 문장을 인용할 때는 문장 번호([N])를 포함하세요.
AI:`;

  // Gemini CLI 스트리밍 (절대 경로 사용)
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn(
        "/home/john/.nvm/versions/node/v20.19.6/bin/gemini",
        ["-p", prompt, "--yolo"],
        { env: { ...process.env, HOME: "/home/john" } }
      );

      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ chunk: chunk.toString() })}\n\n`));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        console.error("Gemini stderr:", chunk.toString());
      });

      child.on("error", (err) => {
        console.error("Gemini spawn error:", err);
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: "Gemini CLI 실행 실패 (로컬 전용)" })}\n\n`));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: "Gemini 응답 생성 실패" })}\n\n`));
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
