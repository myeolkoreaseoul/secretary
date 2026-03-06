import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "7"), 30);
  const endDate =
    searchParams.get("end_date") || new Date().toISOString().split("T")[0];

  // Calculate start date
  const end = new Date(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const startDate = start.toISOString().split("T")[0];

  const { data, error } = await supabaseAdmin
    .from("daily_reports_v2")
    .select("report_date, stats")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  if (error) {
    console.error("Planner API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  // Extract weekly summary
  const weekly = (data || []).map((row) => {
    const stats = (row.stats as Record<string, unknown>) || {};
    const review = stats.review as Record<string, unknown> | undefined;
    return {
      date: row.report_date,
      adherence_pct: review?.adherence_pct ?? null,
      has_plan: Array.isArray(stats.plan) && (stats.plan as unknown[]).length > 0,
      has_actual:
        Array.isArray(stats.actual) && (stats.actual as unknown[]).length > 0,
      distractions: (review?.distractions as string[]) || [],
      exercise: review?.exercise ?? null,
      meals: review?.meals ?? null,
    };
  });

  return NextResponse.json({ weekly, startDate, endDate });
}
