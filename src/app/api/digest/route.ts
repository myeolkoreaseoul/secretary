import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const mode = searchParams.get("mode");
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  if (date && mode) {
    // Fetch specific digest
    const { data, error } = await supabaseAdmin
      .from("digests")
      .select("*")
      .eq("digest_date", date)
      .eq("mode", mode)
      .single();

    if (error) {
      return NextResponse.json({ digest: null });
    }
    return NextResponse.json({ digest: data });
  }

  if (date) {
    // Fetch both morning/evening for a date
    const { data, error } = await supabaseAdmin
      .from("digests")
      .select("*")
      .eq("digest_date", date)
      .order("mode");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ digests: data || [] });
  }

  // Fetch recent digests
  const { data, error } = await supabaseAdmin
    .from("digests")
    .select("*")
    .order("digest_date", { ascending: false })
    .order("mode", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ digests: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, mode, videos, header } = body;

  if (!date || !mode || !videos) {
    return NextResponse.json(
      { error: "date, mode, videos are required" },
      { status: 400 }
    );
  }

  if (!["morning", "evening"].includes(mode)) {
    return NextResponse.json(
      { error: "mode must be morning or evening" },
      { status: 400 }
    );
  }

  // Upsert: replace if same date+mode exists
  const { data: existing } = await supabaseAdmin
    .from("digests")
    .select("id")
    .eq("digest_date", date)
    .eq("mode", mode)
    .single();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("digests")
      .update({
        videos,
        header: header || null,
        video_count: Array.isArray(videos) ? videos.length : 0,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ digest: data });
  }

  const { data, error } = await supabaseAdmin
    .from("digests")
    .insert({
      digest_date: date,
      mode,
      videos,
      header: header || null,
      video_count: Array.isArray(videos) ? videos.length : 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ digest: data }, { status: 201 });
}
