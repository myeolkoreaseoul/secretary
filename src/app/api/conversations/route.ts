import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.min(Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1), 100);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 50);
  const offset = (page - 1) * limit;
  const provider = searchParams.get("provider");
  const q = searchParams.get("q");

  let query = supabaseAdmin
    .from("ai_conversations")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (provider) {
    query = query.eq("provider", provider);
  }

  if (q) {
    query = query.ilike("title", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("conversations API error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  return NextResponse.json({
    conversations: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
