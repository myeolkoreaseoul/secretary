import { NextRequest, NextResponse } from "next/server";
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

// Rate limit: 20 req/min per IP (relay 전용)
const relayRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RELAY_RATE_LIMIT = 20;
const RELAY_RATE_WINDOW_MS = 60 * 1000;

function checkRelayRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = relayRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    relayRateLimitMap.set(ip, { count: 1, resetAt: now + RELAY_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RELAY_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const { video_id } = await params;

  // 1. RELAY_SECRET 검증
  const secret = request.headers.get("x-relay-secret");
  const expectedSecret = process.env.RELAY_SECRET;
  if (!expectedSecret || !secret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. body size 제한 (1MB)
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 1_000_000) {
    return NextResponse.json({ error: "Payload Too Large" }, { status: 413 });
  }

  // 3. IP rate limit
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (!checkRelayRateLimit(ip)) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  // 4. body 파싱
  let body: {
    message: string;
    history: ChatMessage[];
    title: string;
    channel: string;
    sentences: Sentence[];
    summary_json: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { message, history = [], title, channel, sentences } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: "메시지가 비어있습니다" }, { status: 400 });
  }

  // 5. 프롬프트 구성 (chat/route.ts와 동일)
  const transcriptText =
    Array.isArray(sentences) && sentences.length > 0
      ? sentences
          .map((s: Sentence) => `[${s.num}] ${s.timestamp} ${s.text}`)
          .join("\n")
      : "(자막 없음)";

  const historyText =
    history.length > 0
      ? history
          .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
          .join("\n") + "\n\n"
      : "";

  const prompt = `당신은 YouTube 영상 AI 도우미입니다. 아래 영상 내용을 기반으로 질문에 답하세요.

## 영상 정보
제목: ${title}
채널: ${channel}

## 전체 자막
${transcriptText}

---
${historyText}사용자: ${message}

위 질문에 한국어로 간결하게 답하세요. 자막의 특정 문장을 인용할 때는 문장 번호([N])를 포함하세요.
AI:`;

  console.log(`[relay] ${video_id} from ${ip}`);

  // 6. Gemini CLI 스트리밍
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn(
        "/home/john/.nvm/versions/node/v20.19.6/bin/gemini",
        ["-p", prompt, "--yolo"],
        { env: { ...process.env, HOME: "/home/john" } }
      );

      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ chunk: chunk.toString() })}\n\n`)
        );
      });

      child.stderr.on("data", (chunk: Buffer) => {
        console.error("Gemini stderr (relay):", chunk.toString());
      });

      child.on("error", (err) => {
        console.error("Gemini spawn error (relay):", err);
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({ error: "Gemini CLI 실행 실패" })}\n\n`
          )
        );
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      });

      child.on("close", (code) => {
        if (code !== 0) {
          controller.enqueue(
            enc.encode(
              `data: ${JSON.stringify({ error: "Gemini 응답 생성 실패" })}\n\n`
            )
          );
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
