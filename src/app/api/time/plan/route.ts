import { NextRequest, NextResponse } from "next/server";

const SUPABASE_REST = `${process.env.SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: process.env.SUPABASE_SERVICE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
  "Content-Type": "application/json",
};

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const res = await fetch(
    `${SUPABASE_REST}/plan_blocks?date=eq.${date}&order=start_time.asc`,
    { headers, next: { revalidate: 0 } }
  );
  const blocks = await res.json();
  return NextResponse.json(blocks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, start_time, end_time, title, category, color } = body;

  if (!date || !start_time || !end_time || !title) {
    return NextResponse.json({ error: "date, start_time, end_time, title required" }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_REST}/plan_blocks`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ date, start_time, end_time, title, category: category || "coding", color }),
  });
  const created = await res.json();
  return NextResponse.json(created[0] || created);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await fetch(`${SUPABASE_REST}/plan_blocks?id=eq.${id}`, {
    method: "DELETE",
    headers,
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const res = await fetch(`${SUPABASE_REST}/plan_blocks?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  const updated = await res.json();
  return NextResponse.json(updated[0] || updated);
}
