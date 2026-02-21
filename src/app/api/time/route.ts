import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_DURATION_MINUTES = 1440;

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
    console.error('API error:', summaryError);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }

  // Fetch raw activity logs for that date (KST boundaries)
  // KST 00:00 = UTC 15:00 previous day
  const kstStart = new Date(`${date}T00:00:00+09:00`);
  const kstEnd = new Date(`${date}T23:59:59+09:00`);
  const startOfDay = kstStart.toISOString();
  const endOfDay = kstEnd.toISOString();

  const { data: logs, error: logError } = await supabaseAdmin
    .from("activity_logs")
    .select("*")
    .gte("recorded_at", startOfDay)
    .lte("recorded_at", endOfDay)
    .order("recorded_at", { ascending: true });

  if (logError) {
    console.error('API error:', logError);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { description, category, start_time, end_time, duration_minutes } = body;

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  // Duration cap validation
  if (duration_minutes && duration_minutes > MAX_DURATION_MINUTES) {
    return NextResponse.json(
      { error: `duration은 ${MAX_DURATION_MINUTES}분을 초과할 수 없습니다` },
      { status: 400 }
    );
  }

  // Calculate start/end times
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

  // Also validate start_time + end_time doesn't exceed 24h
  const diffMinutes = (endTime.getTime() - startTime.getTime()) / (60 * 1000);
  if (diffMinutes > MAX_DURATION_MINUTES) {
    return NextResponse.json(
      { error: `duration은 ${MAX_DURATION_MINUTES}분을 초과할 수 없습니다` },
      { status: 400 }
    );
  }

  // Insert activity log entries (one per 5-minute interval for proper tracking)
  const entries = [];
  const interval = 5 * 60 * 1000; // 5 minutes
  let current = startTime.getTime();

  while (current < endTime.getTime()) {
    entries.push({
      window_title: description,
      app_name: "manual",
      category: category || null,
      recorded_at: new Date(current).toISOString(),
    });
    current += interval;
  }

  // Ensure at least one entry
  if (entries.length === 0) {
    entries.push({
      window_title: description,
      app_name: "manual",
      category: category || null,
      recorded_at: startTime.toISOString(),
    });
  }

  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .insert(entries)
    .select();

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json(
    { count: data?.length || 0, entries: data },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("activity_logs")
    .delete()
    .eq("id", id);

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
