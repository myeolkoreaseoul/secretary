"""Daily report generator.

Runs via cron at 7am: 0 7 * * * python3 ~/projects/secretary/scripts/daily_report.py

Gathers yesterday's hourly_summaries + telegram_messages,
generates a report via Claude CLI, saves to daily_reports_v2,
and sends summary to Telegram.
"""

import asyncio
import json
import logging
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, BOT_DIR
from bot import telegram_sender as tg

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("daily_report")


async def fetch_yesterday_data(client: httpx.AsyncClient, date_str: str) -> dict:
    """Fetch hourly summaries and telegram messages for a date."""
    # Hourly summaries
    resp = await client.get(
        f"{SUPABASE_REST_URL}/hourly_summaries",
        headers=SUPABASE_HEADERS,
        params={
            "date": f"eq.{date_str}",
            "order": "hour.asc",
        },
    )
    resp.raise_for_status()
    summaries = resp.json()

    # Telegram messages
    start = f"{date_str}T00:00:00Z"
    end = f"{date_str}T23:59:59Z"
    resp = await client.get(
        f"{SUPABASE_REST_URL}/telegram_messages",
        headers=SUPABASE_HEADERS,
        params={
            "select": "role,content,classification,created_at",
            "created_at": f"gte.{start}",
            "and": f"(created_at.lte.{end})",
            "order": "created_at.asc",
        },
    )
    resp.raise_for_status()
    messages = resp.json()

    return {"summaries": summaries, "messages": messages}


def generate_report_via_claude(date_str: str, data: dict) -> str | None:
    """Use Claude CLI to generate a daily report."""
    prompt = (
        f"{date_str} Daily Report를 작성해주세요.\n\n"
        f"시간대별 활동 요약:\n{json.dumps(data['summaries'], ensure_ascii=False, indent=2)}\n\n"
        f"텔레그램 대화 ({len(data['messages'])}개):\n"
    )

    for msg in data["messages"][:30]:
        role = "나" if msg["role"] == "user" else "비서"
        content = msg["content"][:100]
        prompt += f"  [{role}] {content}\n"

    prompt += (
        "\n위 데이터를 바탕으로 간결한 한국어 Daily Report를 작성하세요.\n"
        "포맷: 1) 시간대별 요약 2) 주요 활동 3) 내일 제안"
    )

    cmd = [
        "claude",
        "-p",
        "--dangerously-skip-permissions",
        prompt,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(BOT_DIR.parent),
        )
        if result.returncode == 0:
            return result.stdout.strip()
        log.error("Claude CLI failed: %s", result.stderr[:200])
    except Exception as e:
        log.error("Claude CLI error: %s", e)

    return None


async def save_report(
    client: httpx.AsyncClient, date_str: str, content: str, data: dict
):
    """Save daily report to database."""
    time_grid = {}
    for s in data["summaries"]:
        time_grid[str(s["hour"])] = {
            "summary": s.get("summary", {}),
            "top_apps": s.get("top_apps", []),
        }

    resp = await client.post(
        f"{SUPABASE_REST_URL}/daily_reports_v2",
        headers={
            **SUPABASE_HEADERS,
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        json={
            "report_date": date_str,
            "content": content,
            "time_grid": time_grid,
            "stats": {
                "message_count": len(data["messages"]),
                "active_hours": len(data["summaries"]),
            },
        },
    )
    return resp.status_code < 300


async def main():
    # Target: yesterday in KST (UTC+9), since timer fires at 07:00 KST
    KST = timezone(timedelta(hours=9))
    yesterday = datetime.now(KST) - timedelta(days=1)
    date_str = yesterday.strftime("%Y-%m-%d")

    log.info("Generating daily report for %s", date_str)

    async with httpx.AsyncClient(timeout=30.0) as client:
        data = await fetch_yesterday_data(client, date_str)

        if not data["summaries"] and not data["messages"]:
            log.info("No data for %s, skipping report", date_str)
            return

        # Generate report via Claude
        report_content = generate_report_via_claude(date_str, data)

        if not report_content:
            # Fallback: simple summary
            report_content = (
                f"# {date_str} Daily Report\n\n"
                f"활동 시간: {len(data['summaries'])}시간\n"
                f"텔레그램 메시지: {len(data['messages'])}개\n"
            )

        # Save to DB
        saved = await save_report(client, date_str, report_content, data)
        if saved:
            log.info("Daily report saved for %s", date_str)
        else:
            log.error("Failed to save daily report")

        # Send summary to Telegram (use first allowed user's chat_id)
        # The chat_id should be configured; for now log the report
        log.info("Report:\n%s", report_content[:500])


if __name__ == "__main__":
    asyncio.run(main())
