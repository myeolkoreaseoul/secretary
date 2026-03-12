/**
 * Claude API 직접 호출 (시크릿키 패턴)
 * ~/.claude/.credentials.json에서 OAuth 토큰을 읽어 API를 직접 호출한다.
 * CLI subprocess 대비 ~5배 빠름 (15-30초 → 3-10초)
 */

import { readFileSync } from "fs";
import { join } from "path";

const CREDENTIALS_PATH = join(
  process.env.HOME || "/home/john",
  ".claude",
  ".credentials.json"
);
const API_URL = "https://api.anthropic.com/v1/messages";

function getAccessToken(): string {
  const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
  const data = JSON.parse(raw);
  const oauth = data.claudeAiOauth || {};
  const token = oauth.accessToken;
  if (!token) throw new Error("No Claude OAuth token found");

  // Check expiry (ms → s)
  const expiresAt = (oauth.expiresAt || 0) / 1000;
  if (expiresAt > 0 && Date.now() / 1000 > expiresAt - 300) {
    console.warn("Claude OAuth token is expired or expiring soon — relying on Claude Code to refresh");
  }

  return token;
}

export async function callClaudeAPI(opts: {
  system: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const token = getAccessToken();
  const { system, userMessage, model = "claude-sonnet-4-6", maxTokens = 4096 } = opts;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // Extract text from content blocks
  const textBlocks = (data.content || []).filter(
    (b: { type: string }) => b.type === "text"
  );
  return textBlocks.map((b: { text: string }) => b.text).join("\n");
}
