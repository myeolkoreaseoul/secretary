import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");

  // 최근 24시간 스냅샷 조회 후 worker_id별 최신만 반환
  // (5분 윈도우 대신 — 스캔 지연 시에도 stale 데이터를 보여줌)
  let query = supabaseAdmin
    .from("overseer_worker_snapshots")
    .select("*")
    .gte("scanned_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
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

  // 스캔이 5분 이상 지났으면 status를 last_activity 기반으로 재계산
  const now = Date.now();
  for (const w of latest) {
    const scannedAge = now - new Date(w.scanned_at).getTime();
    if (scannedAge > 5 * 60 * 1000 && w.status === "active") {
      // 스캔 데이터가 오래됐으면 last_activity 기준으로 재판정
      if (w.last_activity) {
        const activityAge = (now - new Date(w.last_activity).getTime()) / 60000;
        if (activityAge > 120) w.status = "offline";
        else if (activityAge > 30) w.status = "idle";
      } else {
        w.status = "offline";
      }
    }
  }

  return NextResponse.json(latest);
}
