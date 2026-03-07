import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");

  let query = supabaseAdmin
    .from("overseer_worker_snapshots")
    .select("*")
    .gte("scanned_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order("scanned_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 워커별 최신 스냅샷만 (worker_id 기준 dedup)
  const seen = new Set<string>();
  const latest = (data || []).filter((w) => {
    if (seen.has(w.worker_id)) return false;
    seen.add(w.worker_id);
    return true;
  });

  return NextResponse.json(latest);
}
