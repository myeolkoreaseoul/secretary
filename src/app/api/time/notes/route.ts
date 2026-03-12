import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST = `${process.env.SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: process.env.SUPABASE_SERVICE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
  "Content-Type": "application/json",
};

// GET /api/time/notes?date=2026-03-12
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const res = await fetch(
    `${SUPABASE_REST}/daily_notes?date=eq.${date}`,
    { headers, next: { revalidate: 0 } }
  );
  const rows = await res.json();
  return NextResponse.json(rows[0] || { date, brain_dump: "", priorities: [] });
}

// PUT /api/time/notes — upsert brain_dump and/or priorities
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { date, brain_dump, priorities } = body;

  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const payload: Record<string, unknown> = { date, updated_at: new Date().toISOString() };
  if (brain_dump !== undefined) payload.brain_dump = brain_dump;
  if (priorities !== undefined) payload.priorities = priorities;

  const res = await fetch(`${SUPABASE_REST}/daily_notes`, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return NextResponse.json(data[0] || data);
}
