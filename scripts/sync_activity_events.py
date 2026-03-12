"""Sync ai_conversations → activity_events.

Converts coding sessions into the unified activity_events table.
Runs incrementally — only processes conversations not yet synced.

Usage:
    python3 -m scripts.sync_activity_events           # incremental
    python3 -m scripts.sync_activity_events --full     # full resync
"""

import asyncio
import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("sync_activity_events")

KST = timezone(timedelta(hours=9))

# Real coding providers (gateway_anthropic = Claude Code via API gateway)
CODING_PROVIDERS = ("claude_code", "codex", "gateway_anthropic")

PROJECT_NAMES = {
    "jd-platform": "jd-platform",
    "tessera": "tessera",
    "sangsi-checker": "sangsi-checker",
    "rnd-audit-tool": "rnd-audit-tool",
    "jd-audit-portal": "jd-audit-portal",
    "userguide-demo": "jd-audit-portal",
    "svvys": "svvys",
    "secretary": "secretary",
    "scouter": "scouter",
    "youtube-digest": "youtube-digest",
    "settlement-qna": "settlement-qna",
}


def extract_project(path: str | None) -> str:
    if not path:
        return "unknown"
    # Handle home directory paths like /home/john (not a project)
    path_clean = path.rstrip("/")
    if path_clean in ("/home/john", "/root", "/home"):
        return "unknown"
    name = path_clean.split("/")[-1]
    # Skip if name is just a username
    if name in ("john", "root", "~"):
        return "unknown"
    return PROJECT_NAMES.get(name, name)


async def fetch_conversations(client: httpx.AsyncClient, full: bool) -> list[dict]:
    """Fetch conversations to sync."""
    params: dict = {
        "select": "id,provider,project_path,title,model,started_at,ended_at,message_count",
        "provider": f"in.({','.join(CODING_PROVIDERS)})",
        "order": "started_at.asc",
    }

    if not full:
        # Get last synced timestamp
        r = await client.get(
            f"{SUPABASE_REST_URL}/activity_events",
            headers=SUPABASE_HEADERS,
            params={
                "select": "started_at",
                "source": "eq.ai_coding",
                "order": "started_at.desc",
                "limit": "1",
            },
        )
        r.raise_for_status()
        rows = r.json()
        if rows:
            last_ts = rows[0]["started_at"]
            params["started_at"] = f"gt.{last_ts}"
            log.info("Incremental sync from %s", last_ts)

    # Paginate (Supabase default limit = 1000)
    all_rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        paged = {**params, "limit": str(page_size), "offset": str(offset)}
        resp = await client.get(
            f"{SUPABASE_REST_URL}/ai_conversations",
            headers=SUPABASE_HEADERS,
            params=paged,
        )
        resp.raise_for_status()
        rows = resp.json()
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size

    return all_rows


import re

# Short/meaningless patterns to replace with project name fallback
_NOISE_PATTERNS = re.compile(
    r"^(안녕|say hi|hello|hi|hey|test|ㅎㅇ|ㅎㅎ|ok|ㅇㅋ|네|yes|no|\.+|help|ping|yo)$",
    re.IGNORECASE,
)
# AGENTS.md / system preamble noise — full line patterns
_PREAMBLE_RE = re.compile(
    r"^(AGENTS\.md|README\.md|CLAUDE\.md|Contents of|<system-reminder>).*$",
    re.IGNORECASE | re.DOTALL,
)


def clean_title(raw: str | None, project: str) -> str:
    """Clean raw conversation title (first user message) into meaningful text."""
    if not raw:
        return f"{project} 코딩 세션"

    t = raw.strip()

    # Strip leading markdown heading markers
    t = re.sub(r"^#+\s*", "", t).strip()

    # Strip preamble noise
    t = _PREAMBLE_RE.sub("", t).strip()

    # "This session is being continued..." → fallback
    if t.startswith("This session is being continued"):
        return f"{project} 코딩 세션 (continued)"

    # If it starts with long system text, just take first line
    if "\n" in t:
        t = t.split("\n")[0].strip()

    # Strip markdown artifacts
    t = t.strip("`#*_>- ")

    # If too short or noise pattern
    if len(t) <= 3 or _NOISE_PATTERNS.match(t):
        return f"{project} 코딩 세션"

    # Truncate to reasonable length
    if len(t) > 80:
        t = t[:77] + "..."

    return t


def conv_to_event(conv: dict) -> dict:
    """Convert a conversation to an activity_event."""
    started = conv["started_at"]
    ended = conv.get("ended_at") or started

    # Calculate duration
    try:
        s = datetime.fromisoformat(started)
        e = datetime.fromisoformat(ended)
        duration = max(1, int((e - s).total_seconds() / 60))
    except (ValueError, TypeError):
        duration = 1

    project = extract_project(conv.get("project_path"))
    title = clean_title(conv.get("title"), project)

    return {
        "source": "ai_coding",
        "category": "coding",
        "title": f"[{project}] {title}",
        "description": None,
        "started_at": started,
        "ended_at": ended,
        "duration_minutes": min(duration, 720),  # cap at 12h
        "metadata": {
            "ref_id": conv["id"],
            "provider": conv.get("provider"),
            "project": project,
            "model": conv.get("model"),
            "message_count": conv.get("message_count"),
        },
    }


async def upsert_events(client: httpx.AsyncClient, events: list[dict]) -> int:
    """Upsert events in batches."""
    inserted = 0
    batch_size = 50

    for i in range(0, len(events), batch_size):
        batch = events[i:i + batch_size]
        resp = await client.post(
            f"{SUPABASE_REST_URL}/activity_events",
            headers={
                **SUPABASE_HEADERS,
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=batch,
        )
        if resp.status_code < 300:
            inserted += len(batch)
        else:
            log.error("Upsert failed: %s", resp.text[:200])

    return inserted


async def fetch_existing_titles(client: httpx.AsyncClient) -> dict[str, str]:
    """Fetch existing GPT-summarized titles (good ones) to preserve across resync."""
    # Bad title patterns that should NOT be preserved
    bad_markers = ["코딩 세션", "Implement the following plan", "Explore the", "I need to"]

    all_rows: list[dict] = []
    offset = 0
    while True:
        resp = await client.get(
            f"{SUPABASE_REST_URL}/activity_events",
            headers=SUPABASE_HEADERS,
            params={
                "select": "title,metadata",
                "source": "eq.ai_coding",
                "limit": "1000",
                "offset": str(offset),
            },
        )
        resp.raise_for_status()
        rows = resp.json()
        all_rows.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000

    # Index by ref_id, only keep good titles
    title_map: dict[str, str] = {}
    for row in all_rows:
        meta = row.get("metadata") or {}
        ref_id = meta.get("ref_id")
        title = row.get("title", "")
        if ref_id and not any(m in title for m in bad_markers):
            title_map[ref_id] = title

    log.info("Preserved %d good titles from existing data", len(title_map))
    return title_map


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Full resync")
    args = parser.parse_args()

    if args.full:
        log.info("Full resync — clearing existing ai_coding events")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Preserve good (GPT-summarized) titles before deleting
        preserved_titles: dict[str, str] = {}
        if args.full:
            preserved_titles = await fetch_existing_titles(client)
            # Delete all ai_coding events
            await client.delete(
                f"{SUPABASE_REST_URL}/activity_events",
                headers=SUPABASE_HEADERS,
                params={"source": "eq.ai_coding"},
            )

        conversations = await fetch_conversations(client, args.full)
        if not conversations:
            log.info("No new conversations to sync")
            return

        log.info("Converting %d conversations", len(conversations))
        events = [conv_to_event(c) for c in conversations]

        # Restore preserved GPT titles
        restored = 0
        for ev in events:
            ref_id = (ev.get("metadata") or {}).get("ref_id")
            if ref_id and ref_id in preserved_titles:
                ev["title"] = preserved_titles[ref_id]
                restored += 1
        if restored:
            log.info("Restored %d GPT-summarized titles", restored)

        inserted = await upsert_events(client, events)
        log.info("Synced %d activity events", inserted)


if __name__ == "__main__":
    asyncio.run(main())
