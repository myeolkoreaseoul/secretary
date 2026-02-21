import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  let query = supabaseAdmin
    .from("yt_summaries")
    .select("id, video_id, title, channel, duration, thumbnail_url, created_at, summary_json");

  if (q) {
    query = query.or(`title.ilike.%${q}%,channel.ilike.%${q}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }

  return NextResponse.json({ videos: data || [] });
}
