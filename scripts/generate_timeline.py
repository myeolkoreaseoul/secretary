"""Generate daily timeline — convert activity_logs to session blocks.

Runs via systemd timer at 22:00 KST (before evening review).

Algorithm:
1. Fetch activity_logs for today (08:00~24:00 KST)
2. Sort by recorded_at
3. Merge consecutive same-app entries into sessions (3min+ = 1 session, 2min+ gap = end)
4. Categorize by rules (app name + window title)
5. Save to daily_reports_v2.stats.actual
"""

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS
from bot import supabase_client as db

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("generate_timeline")

KST = timezone(timedelta(hours=9))

# Gap threshold: 3+ minutes gap = session end
SESSION_GAP_SECONDS = 180
# Minimum session duration to include (seconds)
MIN_SESSION_SECONDS = 120

# Rule-based category mapping (app_name -> category)
APP_CATEGORIES: dict[str, str] = {
    "EXCEL.EXE": "업무",
    "excel": "업무",
    "WINWORD.EXE": "업무",
    "word": "업무",
    "POWERPNT.EXE": "업무",
    "powerpoint": "업무",
    "Code.exe": "개발",
    "code": "개발",
    "WindowsTerminal.exe": "개발",
    "WindowsTerminal": "개발",
    "terminal": "개발",
    "chrome": "웹",
    "Chrome": "웹",
    "firefox": "웹",
    "KakaoTalk.exe": "소통",
    "kakaotalk": "소통",
    "Slack.exe": "소통",
    "slack": "소통",
    "Teams.exe": "소통",
    "teams": "소통",
    "Zoom.exe": "소통",
    "zoom": "소통",
    "manual": "수동입력",
}

# Window title keywords for subcategory detection
TITLE_CATEGORIES: list[tuple[str, str]] = [
    ("youtube", "여가"),
    ("YouTube", "여가"),
    ("넷플릭스", "여가"),
    ("Netflix", "여가"),
    ("트위치", "여가"),
    ("Twitch", "여가"),
    ("정산", "업무"),
    ("보고서", "업무"),
    ("회계", "업무"),
    ("감사", "업무"),
    ("세금", "업무"),
    ("이메일", "업무"),
    ("Gmail", "업무"),
    ("Outlook", "업무"),
    ("GitHub", "개발"),
    ("github", "개발"),
    ("Stack Overflow", "개발"),
    ("stackoverflow", "개발"),
    ("ChatGPT", "개발"),
    ("Claude", "개발"),
    ("뉴스", "정보"),
    ("기사", "정보"),
]


def categorize(app_name: str, window_title: str) -> str:
    """Determine category from app name and window title."""
    title_lower = (window_title or "").lower()

    # Check title keywords first (more specific)
    for keyword, category in TITLE_CATEGORIES:
        if keyword.lower() in title_lower:
            return category

    # Fall back to app-based category
    if app_name:
        # Direct match
        if app_name in APP_CATEGORIES:
            return APP_CATEGORIES[app_name]
        # Case-insensitive match
        app_lower = app_name.lower()
        for key, cat in APP_CATEGORIES.items():
            if key.lower() == app_lower:
                return cat

    return "기타"


def summarize_title(window_title: str, app_name: str) -> str:
    """Create a short activity description from window title."""
    if not window_title:
        return app_name or "알 수 없음"

    # Clean up common suffixes
    title = window_title
    for suffix in [" - Google Chrome", " - Chrome", " - Mozilla Firefox",
                   " - Microsoft Edge", " - Excel", " - Word", " - PowerPoint",
                   " – ", " | "]:
        if suffix in title:
            title = title.split(suffix)[0]

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


# Apps to exclude from timeline (noise)
EXCLUDE_APPS = {"ssh", "shell"}


def build_sessions(logs: list[dict]) -> list[dict]:
    """Merge raw logs into session blocks."""
    if not logs:
        return []

    # Filter out noise (SSH logins, shell commands)
    logs = [
        l for l in logs
        if (l.get("app_name") or "").lower() not in EXCLUDE_APPS
        and not (l.get("window_title") or "").startswith("SSH login:")
        and not (l.get("window_title") or "").startswith("$ ")
    ]

    if not logs:
        return []

    sessions = []
    current_session = None

    for log_entry in logs:
        recorded_at = log_entry.get("recorded_at", "")
        app_name = log_entry.get("app_name", "") or ""
        window_title = log_entry.get("window_title", "") or ""

        try:
            ts = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue

        if current_session is None:
            # Start new session
            current_session = {
                "start_ts": ts,
                "end_ts": ts,
                "app": app_name,
                "titles": [window_title],
                "count": 1,
            }
            continue

        gap = (ts - current_session["end_ts"]).total_seconds()
        same_app = app_name.lower() == current_session["app"].lower()

        if same_app and gap < SESSION_GAP_SECONDS:
            # Extend current session
            current_session["end_ts"] = ts
            if window_title and window_title not in current_session["titles"][-3:]:
                current_session["titles"].append(window_title)
            current_session["count"] += 1
        else:
            # Close current session, start new one
            sessions.append(current_session)
            current_session = {
                "start_ts": ts,
                "end_ts": ts,
                "app": app_name,
                "titles": [window_title],
                "count": 1,
            }

    # Don't forget the last session
    if current_session:
        sessions.append(current_session)

    return sessions


def sessions_to_blocks(sessions: list[dict]) -> list[dict]:
    """Convert sessions to timeline blocks with KST times."""
    blocks = []

    for session in sessions:
        start_kst = session["start_ts"].astimezone(KST)
        end_kst = session["end_ts"].astimezone(KST)

        # Add 1 minute to end to account for last recording interval
        end_kst = end_kst + timedelta(minutes=1)

        duration_seconds = (end_kst - start_kst).total_seconds()
        if duration_seconds < MIN_SESSION_SECONDS:
            continue

        # Use the most common/recent title
        main_title = session["titles"][0] if session["titles"] else ""
        app_name = session["app"]
        category = categorize(app_name, main_title)
        activity = summarize_title(main_title, app_name)

        blocks.append({
            "start": start_kst.strftime("%H:%M"),
            "end": end_kst.strftime("%H:%M"),
            "activity": activity,
            "category": category,
            "app": app_name,
        })

    return blocks


async def fetch_activity_logs(client: httpx.AsyncClient, date_str: str) -> list[dict]:
    """Fetch activity logs for the given date (08:00~24:00 KST)."""
    # KST 08:00 = UTC previous day 23:00
    start_kst = datetime.strptime(f"{date_str} 08:00", "%Y-%m-%d %H:%M")
    start_kst = start_kst.replace(tzinfo=KST)
    start_utc = start_kst.astimezone(timezone.utc)

    # KST 24:00 (next day 00:00) = UTC 15:00
    end_kst = datetime.strptime(f"{date_str} 23:59", "%Y-%m-%d %H:%M")
    end_kst = end_kst.replace(tzinfo=KST)
    end_utc = end_kst.astimezone(timezone.utc)

    resp = await client.get(
        f"{SUPABASE_REST_URL}/activity_logs",
        headers=SUPABASE_HEADERS,
        params={
            "and": f"(recorded_at.gte.{start_utc.isoformat()},recorded_at.lte.{end_utc.isoformat()})",
            "select": "recorded_at,app_name,window_title,url,source",
            "order": "recorded_at.asc",
            "limit": "2000",
        },
    )
    resp.raise_for_status()
    return resp.json()


async def save_actual(date_str: str, actual_blocks: list[dict]) -> None:
    """Save timeline blocks to daily_reports_v2.stats.actual (spread merge)."""
    # Get existing stats to merge
    existing = await db._request(
        "GET",
        f"daily_reports_v2?report_date=eq.{date_str}&select=stats",
    )
    existing = existing or []
    existing_stats = existing[0]["stats"] if existing else {}
    if not existing_stats:
        existing_stats = {}

    # Merge actual into stats (preserve plan, review, etc.)
    new_stats = {**existing_stats, "actual": actual_blocks}

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

    # Allow date override via command line argument
    if len(sys.argv) > 1:
        date_str = sys.argv[1]

    log.info("Generating timeline for %s", date_str)

    async with httpx.AsyncClient(timeout=15) as client:
        logs = await fetch_activity_logs(client, date_str)

    log.info("Fetched %d activity log entries", len(logs))

    if not logs:
        log.info("No activity logs found for %s, saving empty actual", date_str)
        await save_actual(date_str, [])
        return

    # Build sessions from raw logs
    sessions = build_sessions(logs)
    log.info("Built %d sessions from %d logs", len(sessions), len(logs))

    # Convert to timeline blocks
    blocks = sessions_to_blocks(sessions)
    log.info("Generated %d timeline blocks", len(blocks))

    # Save to DB
    await save_actual(date_str, blocks)
    log.info("Saved actual timeline to daily_reports_v2 for %s", date_str)

    # Print summary
    for b in blocks:
        log.info("  %s~%s  %s (%s) [%s]", b["start"], b["end"], b["activity"], b["app"], b["category"])


if __name__ == "__main__":
    asyncio.run(main())
