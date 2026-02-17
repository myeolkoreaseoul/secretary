import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 30;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from("telegram_messages")
    .select("*, category:categories(id, name, color)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.ilike("content", `%${q}%`);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
