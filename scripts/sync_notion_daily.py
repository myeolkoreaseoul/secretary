"""Sync daily work log + review to Notion page.

Reads daily_reports_v2.stats (work_log + review) and creates/updates
a Notion page under the daily log parent page.

Runs via systemd timer at 22:30 KST (after evening_review).
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot import supabase_client as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("sync_notion_daily")

KST = timezone(timedelta(hours=9))

# Notion config
NOTION_TOKEN = os.environ["NOTION_TOKEN"]
NOTION_API = "https://api.notion.com/v1"
NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}
# Parent page for daily logs (Claude Code 설정 검토 + QA 결과의 부모 페이지)
DAILY_LOG_PARENT_ID = os.environ["NOTION_DAILY_LOG_PARENT"]


def _text_block(text: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [{"type": "text", "text": {"content": text}}]
        },
    }


def _heading2(text: str) -> dict:
    return {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": text}}]
        },
    }


def _bullet(text: str) -> dict:
    return {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": text}}]
        },
    }


def build_notion_blocks(stats: dict, date_str: str) -> list[dict]:
    """Build Notion block children from stats."""
    blocks = []
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    weekday = weekdays[dt.weekday()]
    blocks.append(_text_block(f"{date_str} {weekday}요일 일일 기록"))

    # Work log section
    work_log = stats.get("work_log")
    if work_log and work_log.get("entries"):
        sessions = work_log.get('total_sessions', 0)
        compactions = work_log.get('total_compactions', 0)
        label = f"성과 ({sessions}세션" + (f", {compactions}컴팩션)" if compactions > sessions else ")")
        blocks.append(_heading2(label))
        for e in work_log["entries"]:
            blocks.append(_bullet(f"[{e.get('time', '')}] {e.get('summary', '')}"))

    # Review section
    review = stats.get("review")
    if review:
        blocks.append(_heading2(f"리뷰 (달성률 {review.get('adherence_pct', 0)}%)"))
        blocks.append(_bullet(f"요약: {review.get('summary', '')}"))
        if review.get("blocks"):
            for b in review["blocks"][:10]:
                blocks.append(_bullet(
                    f"{b.get('planned', '')}: {b.get('match_pct', 0)}%"
                ))
        if review.get("distractions"):
            blocks.append(_heading2("이탈"))
            for d in review["distractions"][:5]:
                blocks.append(_bullet(d))
        exercise = "완료" if review.get("exercise") else "미완료"
        meals = "정상" if review.get("meals") else "불규칙"
        blocks.append(_bullet(f"운동: {exercise} / 식사: {meals}"))

    # Plan section (brief)
    plan = stats.get("plan")
    if plan:
        blocks.append(_heading2(f"계획 ({len(plan)}블록)"))
        plan_text = stats.get("plan_text", "")
        if plan_text:
            blocks.append(_bullet(f"핵심: {plan_text}"))

    if not blocks or len(blocks) <= 1:
        blocks.append(_text_block("(데이터 없음)"))

    return blocks


async def find_existing_page(client: httpx.AsyncClient, title: str) -> str | None:
    """Find existing page by scanning parent's children (avoids search index delay)."""
    cursor = None
    while True:
        params: dict = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        resp = await client.get(
            f"{NOTION_API}/blocks/{DAILY_LOG_PARENT_ID}/children",
            headers=NOTION_HEADERS,
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()
        for block in data.get("results", []):
            if block.get("type") != "child_page":
                continue
            if block.get("child_page", {}).get("title") == title:
                return block["id"]
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return None


async def create_page(client: httpx.AsyncClient, title: str, blocks: list[dict]) -> str:
    """Create a new Notion page."""
    resp = await client.post(
        f"{NOTION_API}/pages",
        headers=NOTION_HEADERS,
        json={
            "parent": {"page_id": DAILY_LOG_PARENT_ID},
            "properties": {
                "title": {
                    "title": [{"type": "text", "text": {"content": title}}]
                }
            },
            "children": blocks,
        },
    )
    resp.raise_for_status()
    page_id = resp.json()["id"]
    return page_id


async def replace_page_content(client: httpx.AsyncClient, page_id: str, blocks: list[dict]) -> None:
    """Delete existing blocks and append new ones."""
    # Get existing blocks
    resp = await client.get(
        f"{NOTION_API}/blocks/{page_id}/children",
        headers=NOTION_HEADERS,
        params={"page_size": 100},
    )
    resp.raise_for_status()
    existing = resp.json().get("results", [])

    # Delete old blocks
    for block in existing:
        await client.delete(
            f"{NOTION_API}/blocks/{block['id']}",
            headers=NOTION_HEADERS,
        )

    # Append new blocks (Notion limit: 100 per request)
    for i in range(0, len(blocks), 100):
        await client.patch(
            f"{NOTION_API}/blocks/{page_id}/children",
            headers=NOTION_HEADERS,
            json={"children": blocks[i:i + 100]},
        )


async def main():
    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")

    if len(sys.argv) > 1:
        date_str = sys.argv[1]
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            log.error("Invalid date format: %s (expected YYYY-MM-DD)", date_str)
            sys.exit(1)

    log.info("Syncing daily log to Notion for %s", date_str)

    # Load stats from DB
    existing = await db._request(
        "GET",
        f"daily_reports_v2?report_date=eq.{date_str}&select=stats",
    )
    existing = existing or []
    stats = existing[0]["stats"] if existing else {}
    if not stats:
        log.info("No stats for %s, skipping Notion sync", date_str)
        return

    title = f"{date_str} 일일 기록"
    blocks = build_notion_blocks(stats, date_str)

    async with httpx.AsyncClient(timeout=30) as client:
        page_id = await find_existing_page(client, title)

        if page_id:
            log.info("Found existing page %s, replacing content", page_id)
            await replace_page_content(client, page_id, blocks)
        else:
            log.info("Creating new page: %s", title)
            page_id = await create_page(client, title, blocks)

    log.info("Notion sync complete: %s (page %s)", title, page_id)


if __name__ == "__main__":
    asyncio.run(main())
