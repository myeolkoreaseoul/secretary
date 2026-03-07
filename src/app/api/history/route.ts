import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const chatId = searchParams.get("chat_id");
  const telegramOnly = searchParams.get("telegram_only") === "true";
  const page = Math.min(Math.max(parseInt(searchParams.get("page") || "1", 10), 1), 100);
  const limit = 30;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("telegram_messages")
    .select(
      "id, chat_id, sender, role, content, classification, category_id, metadata, created_at, category:categories(id, name, color)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.ilike("content", `%${escapeIlike(q)}%`);
  }

  // chat_id=0: AI 비서 대화만 | telegram_only=true: 텔레그램만(chat_id != 0)
  if (chatId !== null) {
    query = query.eq("chat_id", parseInt(chatId, 10));
  } else if (telegramOnly) {
    query = query.neq("chat_id", 0);
  }

  if (category) {
    // Look up category ID first
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("name", category)
      .single();

    if (cat) {
      query = query.eq("category_id", cat.id);
    }
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({
    messages: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, content } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (content !== undefined) updates.content = content;

  const { data, error } = await supabaseAdmin
    .from("telegram_messages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("telegram_messages")
    .delete()
    .eq("id", id);

  if (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
