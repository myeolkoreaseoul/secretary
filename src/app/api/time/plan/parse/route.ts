import { NextRequest, NextResponse } from "next/server";
import { callClaudeAPI } from "@/lib/claude-api";

const SUPABASE_REST = `${process.env.SUPABASE_URL}/rest/v1`;
const supaHeaders = {
  apikey: process.env.SUPABASE_SERVICE_KEY!,
  Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY!}`,
  "Content-Type": "application/json",
};

const SYSTEM_PROMPT = `You are a daily planning assistant. The user will give you a brain dump — unstructured text about what they want to do today.

Your job:
1. Extract concrete tasks from the text
2. Assign a reasonable time slot (start_time, end_time in HH:MM format, 24h)
3. Assign a category from: coding, communication, meeting, research, health, meal, rest, admin, other
4. Consider the existing plan blocks (if any) to avoid time conflicts

Rules:
- Output ONLY valid JSON array, nothing else
- Each item: { "title": string, "start_time": "HH:MM", "end_time": "HH:MM", "category": string }
- Times must be realistic (not overlapping with existing blocks)
- If the user mentions a rough time, respect it. Otherwise, assign reasonable times.
- Keep titles concise (under 30 chars)
- Korean titles are fine

Example output:
[
  { "title": "tessera 빌드", "start_time": "09:00", "end_time": "11:00", "category": "coding" },
  { "title": "점심", "start_time": "12:00", "end_time": "13:00", "category": "meal" }
]`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, text, existing_blocks } = body;

  if (!date || !text?.trim()) {
    return NextResponse.json({ error: "date and text required" }, { status: 400 });
  }

  let contextMsg = `오늘 날짜: ${date}\n\n`;

  if (existing_blocks?.length) {
    contextMsg += `기존 계획 (이 시간대는 피해줘):\n`;
    for (const b of existing_blocks) {
      contextMsg += `- ${b.start_time}~${b.end_time}: ${b.title}\n`;
    }
    contextMsg += "\n";
  }

  contextMsg += `Brain dump:\n${text}`;

  try {
    const raw = await callClaudeAPI({
      system: SYSTEM_PROMPT,
      userMessage: contextMsg,
      model: "claude-sonnet-4-6",
      maxTokens: 2048,
    });

    // Extract JSON from response (might have markdown fences)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI 응답 파싱 실패", raw }, { status: 500 });
    }

    const tasks = JSON.parse(jsonMatch[0]);

    // Validate structure
    const validated = tasks
      .filter((t: Record<string, unknown>) => t.title && t.start_time && t.end_time)
      .map((t: Record<string, unknown>) => ({
        title: String(t.title).slice(0, 50),
        start_time: String(t.start_time),
        end_time: String(t.end_time),
        category: String(t.category || "other"),
      }));

    return NextResponse.json({ tasks: validated });
  } catch (err) {
    console.error("Plan parse error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
