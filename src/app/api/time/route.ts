import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  // Fetch hourly summaries for the given date
  const { data: summaries, error: summaryError } = await supabaseAdmin
    .from("hourly_summaries")
    .select("*")
    .eq("date", date)
    .order("hour", { ascending: true });

  if (summaryError) {
    return NextResponse.json(
      { error: summaryError.message },
      { status: 500 }
    );
  }

  // Fetch raw activity logs for that date
  const startOfDay = `${date}T00:00:00Z`;
  const endOfDay = `${date}T23:59:59Z`;

  const { data: logs, error: logError } = await supabaseAdmin
    .from("activity_logs")
    .select("*")
    .gte("recorded_at", startOfDay)
    .lte("recorded_at", endOfDay)
    .order("recorded_at", { ascending: true });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  // Fetch daily report if exists
  const { data: report } = await supabaseAdmin
    .from("daily_reports_v2")
    .select("*")
    .eq("report_date", date)
    .single();

  return NextResponse.json({
    date,
    summaries: summaries || [],
    logs: logs || [],
    report: report || null,
  });
}
