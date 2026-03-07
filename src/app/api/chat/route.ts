import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const ownerChatId = parseInt(process.env.OWNER_CHAT_ID!, 10);
    if (isNaN(ownerChatId)) {
      return NextResponse.json(
        { error: "OWNER_CHAT_ID 환경변수가 설정되지 않았습니다" },
        { status: 500 }
      );
    }

    // Handle slash commands (synchronous — reply immediately)
    const todoMatch = message.match(/^\/todo\s+(.+)/);
    if (todoMatch) {
      const title = todoMatch[1].trim();
      await supabaseAdmin
        .from("todos")
        .insert({ title, source: "web-chat", priority: 0 });

      const reply = `할일 추가됨: "${title}"`;
      return NextResponse.json({ reply, action: "todo_added", title });
    }

    const timeMatch = message.match(/^\/time\s+(\S+)\s+(.+)/);
    if (timeMatch) {
      const duration = timeMatch[1];
      const category = timeMatch[2].trim();
      const hours = parseFloat(duration.replace(/h/i, ""));

      if (!isNaN(hours)) {
        const now = new Date();
        const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

        await supabaseAdmin.from("activity_logs").insert({
          window_title: category,
          app_name: "manual",
          category,
          recorded_at: start.toISOString(),
        });

        const reply = `${hours}시간 "${category}" 기록 완료`;
        return NextResponse.json({ reply, action: "time_logged", hours, category });
      }
    }

    const searchMatch = message.match(/^\/search\s+(.+)/);
    if (searchMatch) {
      const query = searchMatch[1].trim();
      const { data: results } = await supabaseAdmin
        .from("telegram_messages")
        .select("content, role, created_at")
        .eq("chat_id", ownerChatId)
        .ilike("content", `%${escapeIlike(query)}%`)
        .order("created_at", { ascending: false })
        .limit(5);

      const reply =
        results && results.length > 0
          ? `검색 결과 (${results.length}건):\n${results
              .map(
                (r) =>
                  `- [${r.role === "user" ? "나" : "비서"}] ${r.content.slice(0, 50)}...`
              )
              .join("\n")}`
          : `"${query}"에 대한 검색 결과가 없습니다`;

      return NextResponse.json({ reply, action: "search", results });
    }

    // Regular conversation — insert into message_queue, Worker processes async
    const { error } = await supabaseAdmin.from("message_queue").insert({
      chat_id: ownerChatId,
      content: message,
      sender: "web",
      metadata: { source: "web" },
    });

    if (error) {
      console.error("message_queue insert error:", error);
      return NextResponse.json({ error: "큐 삽입 실패" }, { status: 500 });
    }

    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
