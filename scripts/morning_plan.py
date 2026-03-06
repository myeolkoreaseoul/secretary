"""Morning planning trigger — enqueues planning prompt to message_queue.

Runs via systemd timer at 8:30 KST.

Instead of sending directly to Telegram, this enqueues a trigger message
into message_queue so the worker picks it up, Claude processes it via
the planning workflow, and sends a proper AI-generated schedule.
"""

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, TELEGRAM_ALLOWED_USERS
from bot import supabase_client as db

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("morning_plan")

KST = timezone(timedelta(hours=9))


async def fetch_todos(client: httpx.AsyncClient) -> list[dict]:
    """Fetch pending todos."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/todos",
        headers=SUPABASE_HEADERS,
        params={
            "is_done": "eq.false",
            "select": "title,priority,due_date,estimated_minutes,time_hint",
            "order": "priority.desc,created_at.asc",
            "limit": "20",
        },
    )
    resp.raise_for_status()
    return resp.json()


async def fetch_yesterday_stats(client: httpx.AsyncClient, date_str: str) -> dict:
    """Fetch yesterday's plan/review from daily_reports_v2."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/daily_reports_v2",
        headers=SUPABASE_HEADERS,
        params={
            "report_date": f"eq.{date_str}",
            "select": "stats",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    if data:
        return data[0].get("stats") or {}
    return {}


def build_trigger_message(todos: list[dict], yesterday_stats: dict) -> str:
    """Build the trigger message that Claude will process."""
    now = datetime.now(KST)
    lines = [f"[아침 플래닝 자동 트리거] {now.strftime('%Y-%m-%d %A')}\n"]

    # Yesterday's unfinished items
    review = yesterday_stats.get("review", {})
    yesterday_plan = yesterday_stats.get("plan", [])

    if review.get("unfinished"):
        lines.append("어제 못 끝낸 일:")
        for item in review["unfinished"][:5]:
            lines.append(f"  - {item}")
        lines.append("")
    elif review.get("summary"):
        lines.append(f"어제 리뷰: {review['summary']}\n")

    # Pending todos
    if todos:
        lines.append("미완료 할일:")
        for t in todos[:15]:
            p = t.get("priority", 0)
            priority_tag = f" [P{p}]" if p > 0 else ""
            due = f" (마감: {t['due_date']})" if t.get("due_date") else ""
            est = f" ~{t['estimated_minutes']}분" if t.get("estimated_minutes") else ""
            hint = f" ({t['time_hint']})" if t.get("time_hint") else ""
            lines.append(f"  - {t['title']}{priority_tag}{due}{est}{hint}")
        lines.append("")

    # Instruction for Claude
    lines.append("→ get_daily_plan으로 오늘 계획 확인 후 시간표를 생성하고,")
    lines.append("  save_daily_plan으로 저장한 뒤 텔레그램으로 전송해주세요.")

    return "\n".join(lines)


async def main():
    if not TELEGRAM_ALLOWED_USERS:
        log.error("No TELEGRAM_ALLOWED_USERS configured")
        sys.exit(1)

    now = datetime.now(KST)
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    async with httpx.AsyncClient(timeout=15) as client:
        todos, yesterday_stats = await asyncio.gather(
            fetch_todos(client),
            fetch_yesterday_stats(client, yesterday),
        )

    message = build_trigger_message(todos, yesterday_stats)
    log.info("Trigger message:\n%s", message)

    # Enqueue to message_queue for each allowed user
    for chat_id in TELEGRAM_ALLOWED_USERS:
        try:
            result = await db.enqueue_message(
                chat_id=chat_id,
                content=message,
                sender="system",
                metadata={"type": "morning_plan_trigger"},
            )
            log.info("Enqueued morning plan trigger queue_id=%s chat_id=%s", result["id"], chat_id)
        except Exception as e:
            log.error("Failed to enqueue for chat_id=%s: %s", chat_id, e)


if __name__ == "__main__":
    asyncio.run(main())
