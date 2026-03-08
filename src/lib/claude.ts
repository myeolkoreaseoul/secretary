import { execFile } from "child_process";

const CLAUDE_BIN = "/home/john/.local/bin/claude";

/**
 * Claude CLI를 호출하여 응답을 받는다. OAuth 인증 사용 (API key 불필요).
 *
 * 단일 메시지: callClaude(systemPrompt, userMessage)
 * 멀티턴:     callClaude(systemPrompt, messages)
 */
export function callClaude(
  systemPrompt: string,
  input: string | { role: string; content: string }[]
): Promise<string> {
  let userPrompt: string;
  if (typeof input === "string") {
    userPrompt = input;
  } else if (input.length === 0) {
    return Promise.reject(new Error("빈 메시지 배열은 허용되지 않습니다"));
  } else {
    userPrompt = input
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");
  }

  return new Promise((resolve, reject) => {
    const proc = execFile(
      CLAUDE_BIN,
      [
        "-p",
        "--model", "sonnet",
        "--system-prompt", systemPrompt,
        "--no-session-persistence",
        userPrompt,
      ],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 5,
        env: {
          ...process.env,
          HOME: "/home/john",
          CLAUDECODE: "", // 중첩 세션 감지 우회
        } as NodeJS.ProcessEnv,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("callClaude error:", error.message, stderr);
          reject(new Error(`Claude CLI failed: ${error.message}`));
          return;
        }
        resolve(stdout.trim());
      }
    );

    proc.stdin?.end();
  });
}
