"""Aggregate Claude Code work logs into daily_reports_v2.stats.work_log.

Reads ~/.claude/handover/work-logs/{date}.jsonl (appended by pre-compact hook)
and saves aggregated summary to daily_reports_v2.stats.work_log (spread merge).

Runs via systemd timer at 22:00 KST (before evening_review).
"""

import asyncio
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot import supabase_client as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("aggregate_work_logs")

KST = timezone(timedelta(hours=9))
WORK_LOGS_DIR = Path.home() / ".claude" / "handover" / "work-logs"


def read_work_logs(date_str: str) -> list[dict]:
    """Read work-log entries from JSONL file for given date."""
    path = WORK_LOGS_DIR / f"{date_str}.jsonl"
    if not path.exists():
        log.info("No work-log file for %s", date_str)
        return []

    entries = []
    seen = set()
    for line in path.read_text("utf-8").strip().split("\n"):
        if not line:
            continue
        try:
            entry = json.loads(line)
            # Deduplicate by (session_id + timestamp) — same session can compact multiple times
            key = (entry.get("session_id", ""), entry.get("timestamp", ""))
            if key in seen:
                continue
            seen.add(key)
            entries.append(entry)
        except json.JSONDecodeError:
            continue

    return entries


def aggregate(entries: list[dict]) -> dict:
    """Aggregate work-log entries into stats.work_log format."""
    result_entries = []
    for e in sorted(entries, key=lambda x: x.get("timestamp", "")):
        ts = e.get("timestamp", "")
        time_str = ts[11:16] if len(ts) >= 16 else ""
        summary = e.get("summary")
        if not summary:
            continue
        # Take first line or first 200 chars of summary
        short = summary.split("\n")[0][:200]
        result_entries.append({
            "time": time_str,
            "summary": short,
            "session_id": e.get("session_id", ""),
            "cwd": e.get("cwd", ""),
        })

    unique_sessions = {e.get("session_id", "") for e in entries}
    return {
        "entries": result_entries,
        "total_sessions": len(unique_sessions),
        "total_compactions": len(entries),
    }


async def save_work_log(date_str: str, work_log: dict) -> None:
    """Save work_log to daily_reports_v2.stats.work_log (spread merge)."""
    existing = await db._request(
        "GET",
        f"daily_reports_v2?report_date=eq.{date_str}&select=stats",
    )
    existing = existing or []
    existing_stats = existing[0]["stats"] if existing else {}
    if not existing_stats:
        existing_stats = {}

    new_stats = {**existing_stats, "work_log": work_log}

    if existing:
        await db._request(
            "PATCH",
            f"daily_reports_v2?report_date=eq.{date_str}",
            json_body={"stats": new_stats},
        )
    else:
        await db._request(
            "POST",
            "daily_reports_v2",
            json_body={"report_date": date_str, "stats": new_stats},
            headers={"Prefer": "return=minimal"},
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

    log.info("Aggregating work logs for %s", date_str)

    entries = read_work_logs(date_str)
    log.info("Found %d work-log entries", len(entries))

    if not entries:
        log.info("No entries to aggregate, skipping")
        return

    work_log = aggregate(entries)
    log.info("Aggregated %d sessions, %d with summaries",
             work_log["total_sessions"], len(work_log["entries"]))

    await save_work_log(date_str, work_log)
    log.info("Saved work_log to daily_reports_v2 for %s", date_str)

    for e in work_log["entries"]:
        log.info("  %s  %s", e["time"], e["summary"])


if __name__ == "__main__":
    asyncio.run(main())
