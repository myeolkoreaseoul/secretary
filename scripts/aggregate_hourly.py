"""Hourly activity aggregation.

Runs via cron every hour: 0 * * * * python3 ~/projects/secretary/scripts/aggregate_hourly.py

Reads activity_logs for the previous hour, aggregates by app,
and stores result in hourly_summaries.
"""

import asyncio
import logging
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("aggregate")


KST = timezone(timedelta(hours=9))


async def main():
    now = datetime.now(KST)
    # Aggregate the previous hour in KST
    target_hour = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    date_str = target_hour.strftime("%Y-%m-%d")
    hour = target_hour.hour  # KST hour (0-23)

    # Convert to UTC for Supabase query
    start = target_hour.astimezone(timezone.utc).isoformat()
    end = (target_hour + timedelta(hours=1)).astimezone(timezone.utc).isoformat()

    log.info("Aggregating %s hour %d (%s to %s)", date_str, hour, start, end)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch activity logs for the hour
        resp = await client.get(
            f"{SUPABASE_REST_URL}/activity_logs",
            headers=SUPABASE_HEADERS,
            params={
                "select": "app_name,window_title,recorded_at",
                "recorded_at": f"gte.{start}",
                "and": f"(recorded_at.lt.{end})",
                "order": "recorded_at.asc",
            },
        )
        resp.raise_for_status()
        logs = resp.json()

        if not logs:
            log.info("No activity logs for this hour")
            return

        # Aggregate by app
        app_counter: Counter[str] = Counter()
        category_counter: Counter[str] = Counter()

        for entry in logs:
            app = entry.get("app_name") or "unknown"
            app_counter[app] += 1

        # Each entry ≈ 1 minute
        top_apps = [
            {"app": app, "minutes": count}
            for app, count in app_counter.most_common(10)
        ]

        summary = {
            "total_entries": len(logs),
            "unique_apps": len(app_counter),
            "active_minutes": len(logs),
        }

        # Upsert hourly summary
        resp = await client.post(
            f"{SUPABASE_REST_URL}/hourly_summaries",
            headers={
                **SUPABASE_HEADERS,
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
            json={
                "date": date_str,
                "hour": hour,
                "summary": summary,
                "top_apps": top_apps,
            },
        )

        if resp.status_code < 300:
            log.info(
                "Saved hourly summary: %s hour %d (%d entries, %d apps)",
                date_str,
                hour,
                len(logs),
                len(app_counter),
            )
        else:
            log.error("Failed to save summary: %s %s", resp.status_code, resp.text[:200])


if __name__ == "__main__":
    asyncio.run(main())
