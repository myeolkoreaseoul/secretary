import { NextRequest, NextResponse } from "next/server";
import { callGpt } from "@/lib/gpt";

const SUPABASE_REST = `${process.env.SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: process.env.SUPABASE_SERVICE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
  "Content-Type": "application/json",
};

const INSTRUCTION = `Brain Dump에서 가장 중요한 우선순위 3개를 추출하는 전문가입니다.
규칙:
- 정확히 3개 (내용이 부족하면 가능한 만큼만)
- 각 항목은 한국어로 간결하게 (최대 30자)
- 실행 가능한 동사형으로 (예: "tessera 배포 확인", "정산 리뷰 완료")
- JSON 배열로만 응답: ["항목1", "항목2", "항목3"]`;

export async function POST(req: NextRequest) {
  const { date, brain_dump } = await req.json();

  if (!brain_dump?.trim()) {
    return NextResponse.json({ error: "brain_dump required" }, { status: 400 });
  }

  try {
    const text = await callGpt(
      INSTRUCTION,
      `오늘(${date}) Brain Dump:\n${brain_dump.slice(0, 2000)}`
    );

    const match = text.match(/\[[\s\S]*\]/);
    const items: string[] = match ? JSON.parse(match[0]) : [];
    const priorities = items.slice(0, 3).map((t: string) => ({ text: t, done: false }));

    // Save to daily_notes
    await fetch(`${SUPABASE_REST}/daily_notes`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ date, priorities, updated_at: new Date().toISOString() }),
    });

    return NextResponse.json({ priorities });
  } catch (e) {
    console.error("GPT priorities error:", e);
    return NextResponse.json({ error: "AI parsing failed" }, { status: 500 });
  }
}
