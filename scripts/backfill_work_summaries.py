"""Backfill work summaries for all past dates.

One-time batch script. Generates summaries for all dates
in ai_conversations and uploads to Notion.

Usage:
    python3 -m scripts.backfill_work_summaries --dry-run   # list dates only
    python3 -m scripts.backfill_work_summaries              # run all
    python3 -m scripts.backfill_work_summaries --from 2026-01-01 --to 2026-03-01
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_HEADERS, SUPABASE_REST_URL
from scripts.daily_work_summary import run as run_summary

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("backfill_work_summaries")

KST = timezone(timedelta(hours=9))


async def fetch_all_dates(
    client: httpx.AsyncClient,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[str]:
    """Get all distinct dates (KST) from ai_conversations."""
    # Supabase REST doesn't support DISTINCT date(), so fetch all started_at
    # and deduplicate in Python
    params: dict = {
        "select": "started_at",
        "order": "started_at.asc",
    }
    if from_date:
        params["started_at"] = f"gte.{from_date}T00:00:00+09:00"
    if to_date:
        if "started_at" in params:
            params["and"] = f"(started_at.lte.{to_date}T23:59:59+09:00)"
        else:
            params["started_at"] = f"lte.{to_date}T23:59:59+09:00"

    resp = await client.get(
        f"{SUPABASE_REST_URL}/ai_conversations",
        headers=SUPABASE_HEADERS,
        params=params,
    )
    resp.raise_for_status()
    rows = resp.json()

    dates = set()
    for row in rows:
        ts = row.get("started_at")
        if ts:
            dt = datetime.fromisoformat(ts)
            kst_dt = dt.astimezone(KST)
            dates.add(kst_dt.strftime("%Y-%m-%d"))

    return sorted(dates)


async def main():
    parser = argparse.ArgumentParser(description="Backfill work summaries")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Only list dates, don't generate summaries",
    )
    parser.add_argument("--from", dest="from_date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_date", help="End date (YYYY-MM-DD)")
    parser.add_argument(
        "--skip-notion", action="store_true",
        help="Skip Notion upload",
    )
    args = parser.parse_args()

    async with httpx.AsyncClient(timeout=30.0) as client:
        dates = await fetch_all_dates(client, args.from_date, args.to_date)

    if not dates:
        log.info("No dates found in ai_conversations")
        return

    log.info("Found %d dates: %s ... %s", len(dates), dates[0], dates[-1])

    if args.dry_run:
        for d in dates:
            print(d)
        print(f"\nTotal: {len(dates)} dates")
        return

    # Process each date
    success = 0
    failed = 0
    for i, date_str in enumerate(dates, 1):
        log.info("[%d/%d] Processing %s", i, len(dates), date_str)
        try:
            result = await run_summary(
                date_str,
                skip_telegram=True,  # Don't spam telegram for backfill
                skip_notion=args.skip_notion,
            )
            if result:
                success += 1
            else:
                log.info("Skipped %s (no data)", date_str)
        except Exception as e:
            log.error("Failed %s: %s", date_str, e)
            failed += 1

        # Rate limit: 1 second between dates
        if i < len(dates):
            await asyncio.sleep(1.0)

    log.info(
        "Backfill complete: %d success, %d failed, %d total",
        success, failed, len(dates),
    )


if __name__ == "__main__":
    asyncio.run(main())
