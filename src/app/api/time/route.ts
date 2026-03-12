import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_DURATION_MINUTES = 1440;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") || "daily";

  switch (view) {
    case "daily":
      return getDailyView(searchParams);
    case "weekly":
      return getWeeklyView(searchParams);
    case "monthly":
      return getMonthlyView(searchParams);
    case "yearly":
      return getYearlyView(searchParams);
    case "legacy":
      return getLegacyView(searchParams);
    default:
      return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }
}

// ── Daily View ──────────────────────────────────────────
async function getDailyView(params: URLSearchParams) {
  const date =
    params.get("date") || new Date().toISOString().split("T")[0];

  const kstStart = `${date}T00:00:00+09:00`;
  const kstEnd = `${date}T23:59:59+09:00`;

  const [eventsRes, reportRes] = await Promise.all([
    supabaseAdmin
      .from("activity_events")
      .select("*")
      .gte("started_at", kstStart)
      .lte("started_at", kstEnd)
      .order("started_at", { ascending: true }),
    supabaseAdmin
      .from("daily_reports_v2")
      .select("*")
      .eq("report_date", date)
      .single(),
  ]);

  if (eventsRes.error) {
    console.error("API error:", eventsRes.error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  const events = eventsRes.data || [];

  // Compute stats
  const categories: Record<string, number> = {};
  const projectSet = new Set<string>();
  let totalMinutes = 0;

  for (const e of events) {
    const mins = e.duration_minutes || 0;
    totalMinutes += mins;
    categories[e.category] = (categories[e.category] || 0) + mins;
    const project = (e.metadata as Record<string, unknown>)?.project as string;
    if (project) projectSet.add(project);
  }

  // density: tracked minutes / 16 waking hours
  const density = Math.min(100, Math.round((totalMinutes / 960) * 100));

  return NextResponse.json({
    date,
    events,
    stats: {
      total_minutes: totalMinutes,
      total_sessions: events.length,
      projects: Array.from(projectSet),
      categories,
      density,
    },
    report: reportRes.data || null,
  });
}

// ── Weekly View ─────────────────────────────────────────
async function getWeeklyView(params: URLSearchParams) {
  const dateStr =
    params.get("date") || new Date().toISOString().split("T")[0];
  const anchor = new Date(dateStr + "T00:00:00+09:00");

  // Find Monday of the week
  const day = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((day + 6) % 7));

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startStr = formatKSTDate(monday);
  const endStr = formatKSTDate(sunday);

  const { data: events, error } = await supabaseAdmin
    .from("activity_events")
    .select("started_at,category,duration_minutes,metadata")
    .gte("started_at", `${startStr}T00:00:00+09:00`)
    .lte("started_at", `${endStr}T23:59:59+09:00`)
    .order("started_at", { ascending: true });

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  // Group by date
  const dayMap: Record<string, { minutes: number; categories: Record<string, number>; sessions: number }> = {};
  const projectMinutes: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dayMap[formatKSTDate(d)] = { minutes: 0, categories: {}, sessions: 0 };
  }

  for (const e of events || []) {
    const d = toKSTDate(e.started_at);
    if (!dayMap[d]) continue;
    const mins = e.duration_minutes || 0;
    dayMap[d].minutes += mins;
    dayMap[d].sessions += 1;
    dayMap[d].categories[e.category] = (dayMap[d].categories[e.category] || 0) + mins;

    const project = (e.metadata as Record<string, unknown>)?.project as string;
    if (project) projectMinutes[project] = (projectMinutes[project] || 0) + mins;
  }

  const days = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      total_minutes: v.minutes,
      categories: v.categories,
      session_count: v.sessions,
    }));

  const totalMinutes = days.reduce((s, d) => s + d.total_minutes, 0);
  const totalSessions = days.reduce((s, d) => s + d.session_count, 0);
  const topProjects = Object.entries(projectMinutes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, minutes]) => ({ name, minutes }));

  return NextResponse.json({
    start_date: startStr,
    end_date: endStr,
    days,
    totals: {
      total_minutes: totalMinutes,
      total_sessions: totalSessions,
      avg_minutes_per_day: Math.round(totalMinutes / 7),
      top_projects: topProjects,
    },
  });
}

// ── Monthly View ────────────────────────────────────────
async function getMonthlyView(params: URLSearchParams) {
  const year = parseInt(params.get("year") || String(new Date().getFullYear()));
  const month = parseInt(params.get("month") || String(new Date().getMonth() + 1));

  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endStr = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const { data: events, error } = await supabaseAdmin
    .from("activity_events")
    .select("started_at,category,duration_minutes,metadata")
    .gte("started_at", `${startStr}T00:00:00+09:00`)
    .lte("started_at", `${endStr}T23:59:59+09:00`)
    .order("started_at", { ascending: true });

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  // Group by date
  const dayMap: Record<string, { minutes: number; categories: Record<string, number>; sessions: number }> = {};
  const projectMinutes: Record<string, number> = {};

  for (const e of events || []) {
    const d = toKSTDate(e.started_at);
    if (!dayMap[d]) dayMap[d] = { minutes: 0, categories: {}, sessions: 0 };
    const mins = e.duration_minutes || 0;
    dayMap[d].minutes += mins;
    dayMap[d].sessions += 1;
    dayMap[d].categories[e.category] = (dayMap[d].categories[e.category] || 0) + mins;

    const project = (e.metadata as Record<string, unknown>)?.project as string;
    if (project) projectMinutes[project] = (projectMinutes[project] || 0) + mins;
  }

  const days = [];
  for (let i = 1; i <= lastDay; i++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const info = dayMap[dateStr];
    let dominantCategory: string | null = null;
    if (info) {
      const sorted = Object.entries(info.categories).sort(([, a], [, b]) => b - a);
      dominantCategory = sorted[0]?.[0] || null;
    }
    days.push({
      date: dateStr,
      total_minutes: info?.minutes || 0,
      dominant_category: dominantCategory,
      session_count: info?.sessions || 0,
    });
  }

  const totalMinutes = days.reduce((s, d) => s + d.total_minutes, 0);
  const totalSessions = days.reduce((s, d) => s + d.session_count, 0);
  const activeDays = days.filter((d) => d.total_minutes > 0).length;
  const topProjects = Object.entries(projectMinutes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, minutes]) => ({ name, minutes }));

  return NextResponse.json({
    year,
    month,
    days,
    totals: {
      total_minutes: totalMinutes,
      total_sessions: totalSessions,
      active_days: activeDays,
      top_projects: topProjects,
    },
  });
}

// ── Yearly View ─────────────────────────────────────────
async function getYearlyView(params: URLSearchParams) {
  const year = parseInt(params.get("year") || String(new Date().getFullYear()));

  const { data: events, error } = await supabaseAdmin
    .from("activity_events")
    .select("started_at,duration_minutes")
    .gte("started_at", `${year}-01-01T00:00:00+09:00`)
    .lte("started_at", `${year}-12-31T23:59:59+09:00`)
    .order("started_at", { ascending: true });

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  // Group by date
  const dayMap: Record<string, { minutes: number; sessions: number }> = {};
  const monthlyMap: Record<number, { minutes: number; sessions: number }> = {};

  for (const e of events || []) {
    const d = toKSTDate(e.started_at);
    const mins = e.duration_minutes || 0;

    if (!dayMap[d]) dayMap[d] = { minutes: 0, sessions: 0 };
    dayMap[d].minutes += mins;
    dayMap[d].sessions += 1;

    const m = parseInt(d.split("-")[1]);
    if (!monthlyMap[m]) monthlyMap[m] = { minutes: 0, sessions: 0 };
    monthlyMap[m].minutes += mins;
    monthlyMap[m].sessions += 1;
  }

  const days = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      total_minutes: v.minutes,
      session_count: v.sessions,
    }));

  const totalMinutes = days.reduce((s, d) => s + d.total_minutes, 0);
  const totalSessions = days.reduce((s, d) => s + d.session_count, 0);
  const activeDays = days.length;

  const monthlyBreakdown = [];
  for (let m = 1; m <= 12; m++) {
    const info = monthlyMap[m];
    monthlyBreakdown.push({
      month: m,
      minutes: info?.minutes || 0,
      sessions: info?.sessions || 0,
    });
  }

  return NextResponse.json({
    year,
    days,
    totals: {
      total_minutes: totalMinutes,
      total_sessions: totalSessions,
      active_days: activeDays,
      monthly_breakdown: monthlyBreakdown,
    },
  });
}

// ── Legacy View (기존 activity_logs 기반) ───────────────
async function getLegacyView(params: URLSearchParams) {
  const date =
    params.get("date") || new Date().toISOString().split("T")[0];

  const kstStart = new Date(`${date}T00:00:00+09:00`);
  const kstEnd = new Date(`${date}T23:59:59+09:00`);

  const [summariesRes, logsRes, reportRes] = await Promise.all([
    supabaseAdmin
      .from("hourly_summaries")
      .select("*")
      .eq("date", date)
      .order("hour", { ascending: true }),
    supabaseAdmin
      .from("activity_logs")
      .select("*")
      .gte("recorded_at", kstStart.toISOString())
      .lte("recorded_at", kstEnd.toISOString())
      .order("recorded_at", { ascending: true }),
    supabaseAdmin
      .from("daily_reports_v2")
      .select("*")
      .eq("report_date", date)
      .single(),
  ]);

  if (summariesRes.error) {
    console.error("API error:", summariesRes.error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  return NextResponse.json({
    date,
    summaries: summariesRes.data || [],
    logs: logsRes.data || [],
    report: reportRes.data || null,
  });
}

// ── Helpers ─────────────────────────────────────────────
function toKSTDate(iso: string): string {
  const dt = new Date(iso);
  // KST = UTC+9
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

function formatKSTDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── POST & DELETE (기존 유지) ────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { description, category, start_time, end_time, duration_minutes } = body;

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  if (duration_minutes && duration_minutes > MAX_DURATION_MINUTES) {
    return NextResponse.json(
      { error: `duration은 ${MAX_DURATION_MINUTES}분을 초과할 수 없습니다` },
      { status: 400 }
    );
  }

  let startTime: Date;
  let endTime: Date;

  if (start_time && end_time) {
    startTime = new Date(start_time);
    endTime = new Date(end_time);
  } else if (start_time && duration_minutes) {
    startTime = new Date(start_time);
    endTime = new Date(startTime.getTime() + duration_minutes * 60 * 1000);
  } else if (duration_minutes) {
    endTime = new Date();
    startTime = new Date(endTime.getTime() - duration_minutes * 60 * 1000);
  } else {
    return NextResponse.json(
      { error: "start_time+end_time or duration_minutes required" },
      { status: 400 }
    );
  }

  const diffMinutes = (endTime.getTime() - startTime.getTime()) / (60 * 1000);
  if (diffMinutes > MAX_DURATION_MINUTES) {
    return NextResponse.json(
      { error: `duration은 ${MAX_DURATION_MINUTES}분을 초과할 수 없습니다` },
      { status: 400 }
    );
  }

  // Insert into activity_events (new unified table)
  const { data, error } = await supabaseAdmin
    .from("activity_events")
    .insert({
      source: "manual",
      category: category || "other",
      title: description,
      started_at: startTime.toISOString(),
      ended_at: endTime.toISOString(),
      duration_minutes: Math.round(diffMinutes),
      metadata: { manual: true },
    })
    .select()
    .single();

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("activity_events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
