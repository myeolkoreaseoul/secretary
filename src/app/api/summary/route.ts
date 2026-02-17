import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryName = searchParams.get("category") || "";

  // Get category messages for summary
  let query = supabaseAdmin
    .from("telegram_messages")
    .select("content, classification, created_at")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(20);

  if (categoryName) {
    const { data: cat } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("name", categoryName)
      .single();

    if (cat) {
      query = query.eq("category_id", cat.id);
    }
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({
      summary: "아직 이 카테고리에 메시지가 없습니다.",
    });
  }

  // Build a simple summary from classifications
  const titles = messages
    .map((m) => {
      const c = m.classification as Record<string, unknown> | null;
      return c?.title || m.content.slice(0, 30);
    })
    .slice(0, 10);

  const summary = `최근 ${messages.length}개 메시지: ${titles.join(", ")}`;

  return NextResponse.json({ summary, messageCount: messages.length });
}
