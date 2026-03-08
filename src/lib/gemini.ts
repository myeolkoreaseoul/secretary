import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const GEMINI_BIN = "/home/john/.nvm/versions/node/v20.19.6/bin/gemini";

/**
 * Gemini CLI를 호출하여 응답을 받는다. OAuth 인증 사용 (API key 불필요).
 * claude.ts와 동일한 execFile + Promise 패턴.
 */
export function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 시스템 프롬프트를 임시 파일로 작성
    const tmpFile = join(tmpdir(), `gemini-sys-${Date.now()}.md`);
    writeFileSync(tmpFile, systemPrompt, "utf-8");

    const proc = execFile(
      GEMINI_BIN,
      ["--output-format", "json", userMessage],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 5,
        env: {
          ...process.env,
          HOME: "/home/john",
          GEMINI_SYSTEM_MD: tmpFile,
        },
      },
      (error, stdout, stderr) => {
        // 임시 파일 정리
        try { unlinkSync(tmpFile); } catch {}

        if (error) {
          console.error("callGemini error:", error.message, stderr);
          reject(new Error(`Gemini CLI failed: ${error.message}`));
          return;
        }

        try {
          const json = JSON.parse(stdout);
          resolve(json.response || stdout.trim());
        } catch {
          // JSON 파싱 실패 시 raw text 반환
          resolve(stdout.trim());
        }
      }
    );

    // CRITICAL: stdin hang 방지 (GitHub Issue #6715)
    proc.stdin?.end();
  });
}
