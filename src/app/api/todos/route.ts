import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("todos")
    .select("*, category:categories(id, name, color)")
    .order("is_done", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ todos: data || [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, description, category_id, priority, due_date } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("todos")
    .insert({
      title,
      description: description || null,
      category_id: category_id || null,
      priority: priority ?? 0,
      due_date: due_date || null,
      source: "web",
    })
    .select()
    .single();

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ todo: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Handle completion timestamp
  if ("is_done" in updates) {
    updates.completed_at = updates.is_done ? new Date().toISOString() : null;
  }

  const { data, error } = await supabaseAdmin
    .from("todos")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ todo: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("todos").delete().eq("id", id);

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
