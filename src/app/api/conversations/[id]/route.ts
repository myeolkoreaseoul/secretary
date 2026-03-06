import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const msgLimit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const msgOffset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  // 대화 조회
  const { data: conversation, error: convError } = await supabaseAdmin
    .from("ai_conversations")
    .select("*")
    .eq("id", id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });
  }

  // 메시지 조회
  const { data: messages, count, error: msgError } = await supabaseAdmin
    .from("ai_messages")
    .select("id, role, content, token_count, model, message_at", { count: "exact" })
    .eq("conversation_id", id)
    .order("message_at", { ascending: true })
    .range(msgOffset, msgOffset + msgLimit - 1);

  if (msgError) {
    console.error("messages API error:", msgError);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }

  return NextResponse.json({
    conversation,
    messages: messages || [],
    totalMessages: count || 0,
  });
}
