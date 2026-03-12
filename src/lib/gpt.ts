/**
 * GPT 시크릿키 — Codex OAuth → chatgpt.com backend API
 *
 * Env vars needed:
 *   GPT_ACCESS_TOKEN  — from ~/.codex/auth.json tokens.access_token
 */

const GPT_URL = "https://chatgpt.com/backend-api/codex/responses";

export async function callGpt(
  instruction: string,
  userMessage: string,
  opts?: { model?: string; maxTokens?: number }
): Promise<string> {
  const token = process.env.GPT_ACCESS_TOKEN;
  if (!token) throw new Error("GPT_ACCESS_TOKEN not set");

  const body = {
    model: opts?.model || "gpt-5.4",
    instructions: instruction,
    input: [{ type: "message", role: "user", content: userMessage }],
    store: false,
    stream: true,
  };

  const resp = await fetch(GPT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`GPT API error: ${resp.status} ${resp.statusText}`);
  }

  // Parse SSE stream
  const text = await resp.text();
  let result = "";
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const dataStr = line.slice(6);
    if (dataStr === "[DONE]") break;
    try {
      const data = JSON.parse(dataStr);
      if (data.type === "response.output_text.delta") {
        result += data.delta || "";
      }
    } catch { /* skip non-JSON lines */ }
  }

  return result.trim();
}
