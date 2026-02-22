import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { spawnSync } from "child_process";

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

  // 자막 텍스트 구성
  const transcriptText = Array.isArray(video.sentences) && video.sentences.length > 0
    ? video.sentences
        .map((s: Sentence) => `[${s.num}] ${s.timestamp} ${s.text}`)
        .join("\n")
    : "(자막 없음)";

  // 대화 기록 구성 (초기 인사 제외)
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

  // Gemini CLI 실행 (spawnSync → 쉘 인젝션 없음)
  const result = spawnSync("gemini", ["-p", prompt, "--yolo"], {
    env: { ...process.env, HOME: "/home/john" },
    timeout: 90000,
    maxBuffer: 5 * 1024 * 1024,
  });

  if (result.error) {
    console.error("Gemini CLI error:", result.error);
    return NextResponse.json(
      { error: "Gemini CLI를 실행할 수 없습니다. 로컬 환경에서만 동작합니다." },
      { status: 503 }
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || "";
    console.error("Gemini CLI stderr:", stderr);
    return NextResponse.json({ error: "Gemini 응답 생성 실패" }, { status: 500 });
  }

  const response = result.stdout?.toString().trim() || "";
  return NextResponse.json({ response });
}
