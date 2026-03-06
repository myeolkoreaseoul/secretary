import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  // Fetch daily report (plan is stored in stats.plan)
  const { data: report } = await supabaseAdmin
    .from("daily_reports_v2")
    .select("*")
    .eq("report_date", date)
    .single();

  // Fetch today's todos
  const { data: todos } = await supabaseAdmin
    .from("todos")
    .select("*, category:categories(id, name, color)")
    .eq("is_done", false)
    .order("priority", { ascending: false });

  // Filter todos for today (due_date = today or no due_date)
  const todayTodos = (todos || []).filter(
    (t) => !t.due_date || t.due_date === date
  );

  const plan = report?.stats?.plan || null;
  const planText = report?.stats?.plan_text || "";

  return NextResponse.json({
    date,
    plan,
    planText,
    todos: todayTodos,
    report: report || null,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, plan, planText, action } = body;

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  // AI auto-generate plan
  if (action === "generate") {
    // Fetch today's todos
    const { data: todos } = await supabaseAdmin
      .from("todos")
      .select("title, priority, due_date, category:categories(name)")
      .eq("is_done", false)
      .order("priority", { ascending: false });

    const todayTodos = (todos || []).filter(
      (t) => !t.due_date || t.due_date === date
    );

    // Fetch yesterday's activity summary
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: yesterdayReport } = await supabaseAdmin
      .from("daily_reports_v2")
      .select("content")
      .eq("report_date", yesterdayStr)
      .single();

    // Fetch recent time patterns (last 7 days hourly summaries)
    const weekAgo = new Date(date);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: recentSummaries } = await supabaseAdmin
      .from("hourly_summaries")
      .select("date, hour, top_apps")
      .gte("date", weekAgo.toISOString().split("T")[0])
      .lte("date", date)
      .order("date")
      .order("hour");

    // Analyze patterns
    const hourlyPatterns: Record<number, string[]> = {};
    for (const s of recentSummaries || []) {
      if (!hourlyPatterns[s.hour]) hourlyPatterns[s.hour] = [];
      const apps = (s.top_apps || []).map((a: { app: string }) => a.app);
      hourlyPatterns[s.hour].push(...apps);
    }

    const patternSummary = Object.entries(hourlyPatterns)
      .map(([hour, apps]) => {
        const counts: Record<string, number> = {};
        for (const a of apps) counts[a] = (counts[a] || 0) + 1;
        const top = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([app]) => app)
          .join(", ");
        return `${hour}시: ${top || "없음"}`;
      })
      .join("\n");

    const prompt = `오늘(${date})의 일일 계획을 짜주세요.

## 오늘 할일 목록
${todayTodos.map((t) => {
      const cat = t.category as unknown;
      const catName = cat && typeof cat === "object" && "name" in (cat as Record<string, unknown>) ? (cat as Record<string, string>).name : "";
      return `- [P${t.priority}] ${t.title}${catName ? ` (${catName})` : ""}`;
    }).join("\n") || "없음"}

## 어제의 리포트
${yesterdayReport?.content?.slice(0, 500) || "없음"}

## 최근 7일 시간대별 활동 패턴
${patternSummary || "데이터 없음"}

## 규칙
1. 시간 블록으로 계획을 짜세요 (09:00-11:00 형식)
2. 할일 목록의 우선순위를 반영하세요
3. 과거 패턴을 참고하여 현실적인 계획을 세우세요
4. 점심(12-13시), 저녁(18-19시) 시간은 빼주세요
5. JSON 배열로 반환하세요

## 출력 형식 (JSON만 출력)
{
  "plan": [
    { "start": "09:00", "end": "11:00", "task": "할일 내용", "category": "카테고리" }
  ],
  "summary": "오늘의 핵심 목표 한 줄 요약"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AI 응답 파싱 실패" },
        { status: 500 }
      );
    }

    const generated = JSON.parse(jsonMatch[0]);

    // Save to daily_reports_v2
    await upsertPlan(date, generated.plan, generated.summary || "");

    return NextResponse.json({
      plan: generated.plan,
      planText: generated.summary || "",
    });
  }

  // Manual save
  await upsertPlan(date, plan || [], planText || "");

  return NextResponse.json({ success: true });
}

async function upsertPlan(
  date: string,
  plan: unknown[],
  planText: string
) {
  // Check if report exists
  const { data: existing } = await supabaseAdmin
    .from("daily_reports_v2")
    .select("id, stats")
    .eq("report_date", date)
    .single();

  if (existing) {
    const stats = { ...(existing.stats as Record<string, unknown> || {}), plan, plan_text: planText };
    await supabaseAdmin
      .from("daily_reports_v2")
      .update({ stats })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("daily_reports_v2").insert({
      report_date: date,
      stats: { plan, plan_text: planText },
    });
  }
}
