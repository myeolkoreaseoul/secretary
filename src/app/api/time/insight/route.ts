import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Simple in-memory cache (per serverless instance)
const cache: Record<string, { text: string; ts: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  // Check cache
  if (cache[date] && Date.now() - cache[date].ts < CACHE_TTL) {
    return NextResponse.json({ insight: cache[date].text });
  }

  // Fetch events for the day
  const { data: events } = await supabaseAdmin
    .from("activity_events")
    .select("title,category,duration_minutes,metadata,started_at,ended_at")
    .gte("started_at", `${date}T00:00:00+09:00`)
    .lte("started_at", `${date}T23:59:59+09:00`)
    .order("started_at", { ascending: true });

  if (!events || events.length === 0) {
    return NextResponse.json({ insight: null });
  }

  // Build summary for AI
  const totalMins = events.reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const projects: Record<string, number> = {};
  const categories: Record<string, number> = {};
  for (const e of events) {
    const p = (e.metadata as Record<string, unknown>)?.project as string || "unknown";
    projects[p] = (projects[p] || 0) + (e.duration_minutes || 0);
    categories[e.category] = (categories[e.category] || 0) + (e.duration_minutes || 0);
  }

  const topProjects = Object.entries(projects).sort(([, a], [, b]) => b - a).slice(0, 5);
  const topCats = Object.entries(categories).sort(([, a], [, b]) => b - a);

  const firstStart = events[0].started_at?.slice(11, 16) || "?";
  const lastEnd = events[events.length - 1].ended_at?.slice(11, 16) || events[events.length - 1].started_at?.slice(11, 16) || "?";

  const summary = `날짜: ${date}
세션: ${events.length}개 | 총 ${Math.floor(totalMins / 60)}시간 ${totalMins % 60}분
활동 시간대: ${firstStart} ~ ${lastEnd}
프로젝트: ${topProjects.map(([n, m]) => `${n}(${m}분)`).join(", ")}
카테고리: ${topCats.map(([c, m]) => `${c}(${m}분)`).join(", ")}
주요 작업: ${events.filter(e => (e.duration_minutes || 0) >= 5).slice(0, 8).map(e => e.title?.replace(/^\[.*?\]\s*/, "")).join(" / ")}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `다음은 개발자의 하루 활동 요약입니다. 3줄 이내의 짧은 인사이트를 한국어로 작성해주세요.
코칭/동기부여 톤으로, 잘한 점 1개 + 개선점 또는 관찰 1개 + 내일 제안 1개.
각 줄은 20자 내외로 간결하게.

${summary}`,
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    cache[date] = { text, ts: Date.now() };
    return NextResponse.json({ insight: text });
  } catch {
    return NextResponse.json({ insight: null });
  }
}
