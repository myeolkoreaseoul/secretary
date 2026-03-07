import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scanType = body.type || "all";

  if (!["all", "git", "fs", "svc"].includes(scanType)) {
    return NextResponse.json({ error: "Invalid scan type" }, { status: 400 });
  }

  try {
    const scriptPath = `${process.cwd()}/scripts/overseer/main.py`;
    const { stdout, stderr } = await execAsync(
      `cd ${process.cwd()} && python3 -m scripts.overseer.main --type ${scanType}`,
      { timeout: 120000 }
    );

    return NextResponse.json({
      success: true,
      type: scanType,
      output: stdout.slice(-2000),
      errors: stderr ? stderr.slice(-500) : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
