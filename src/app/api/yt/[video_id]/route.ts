import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ video_id: string }> }
) {
  const { video_id } = await params;

  const { data, error } = await supabaseAdmin
    .from("yt_summaries")
    .select("*")
    .eq("video_id", video_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "영상을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(data);
}
