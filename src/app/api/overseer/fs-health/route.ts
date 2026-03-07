import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");

  let query = supabaseAdmin
    .from("overseer_fs_snapshots")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(20);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
