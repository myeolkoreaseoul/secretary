"""Evening review — compare plan vs actual + enqueue review trigger.

Runs via systemd timer at 22:00 KST (after generate_timeline).

Flow:
1. Load today's stats (plan + actual) from daily_reports_v2
2. Match plan blocks against actual blocks by time overlap
3. Calculate adherence percentage per block and overall
4. Detect distractions (actual blocks not matching any plan)
5. Build review JSONB and save to stats.review
6. Enqueue trigger message for Claude to format and send via Telegram
"""

import asyncio
import json
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import TELEGRAM_ALLOWED_USERS
from bot import supabase_client as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("evening_review")

KST = timezone(timedelta(hours=9))


def time_to_minutes(t: str) -> int:
    """Convert HH:MM to minutes since midnight."""
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def overlap_minutes(start1: str, end1: str, start2: str, end2: str) -> int:
    """Calculate overlap in minutes between two time ranges."""
    s1, e1 = time_to_minutes(start1), time_to_minutes(end1)
    s2, e2 = time_to_minutes(start2), time_to_minutes(end2)
    overlap_start = max(s1, s2)
    overlap_end = min(e1, e2)
    return max(0, overlap_end - overlap_start)


def match_plan_vs_actual(plan: list[dict], actual: list[dict]) -> list[dict]:
    """Match each plan block against actual blocks by time overlap and category."""
    results = []

    for plan_block in plan:
        p_start = plan_block.get("start", "")
        p_end = plan_block.get("end", "")
        p_task = plan_block.get("task", "")
        p_category = plan_block.get("category", "")

        if not p_start or not p_end:
            continue

        p_duration = time_to_minutes(p_end) - time_to_minutes(p_start)
        if p_duration <= 0:
            continue

        # Find actual blocks overlapping this plan block
        matching_minutes = 0
        overlapping_actuals = []

        for actual_block in actual:
            a_start = actual_block.get("start", "")
            a_end = actual_block.get("end", "")
            a_category = actual_block.get("category", "")
            a_activity = actual_block.get("activity", "")

            if not a_start or not a_end:
                continue

            ol = overlap_minutes(p_start, p_end, a_start, a_end)
            if ol > 0:
                overlapping_actuals.append({
                    "activity": a_activity,
                    "category": a_category,
                    "minutes": ol,
                })
                # Count as matching if category aligns
                if _categories_match(p_category, a_category):
                    matching_minutes += ol

        match_pct = round(matching_minutes / p_duration * 100) if p_duration > 0 else 0

        # Build summary of what actually happened
        if overlapping_actuals:
            actual_parts = []
            for oa in sorted(overlapping_actuals, key=lambda x: -x["minutes"]):
                actual_parts.append(f"{oa['activity']} {oa['minutes']}분")
            actual_summary = ", ".join(actual_parts[:3])
        else:
            actual_summary = "기록 없음"

        results.append({
            "planned": f"{p_task} {p_start}~{p_end}",
            "actual_summary": actual_summary,
            "match_pct": match_pct,
        })

    return results


def _categories_match(plan_cat: str, actual_cat: str) -> bool:
    """Check if plan category and actual category are compatible."""
    # If either category is empty, match by time overlap alone
    if not plan_cat or not actual_cat:
        return True
    # Direct match
    if plan_cat == actual_cat:
        return True
    # Broad matches — "웹" included (Chrome work shows as "웹" but plan says "업무")
    work_cats = {"업무", "개발", "회의", "웹"}
    if plan_cat in work_cats and actual_cat in work_cats:
        return True
    return False


def find_distractions(plan: list[dict], actual: list[dict]) -> list[str]:
    """Find actual activities that don't match any plan block."""
    distractions = []
    distraction_cats = {"여가", "소통", "기타", "웹"}

    for actual_block in actual:
        a_start = actual_block.get("start", "")
        a_end = actual_block.get("end", "")
        a_category = actual_block.get("category", "")
        a_activity = actual_block.get("activity", "")

        if not a_start or not a_end:
            continue

        # Skip if this is during fixed block time (meals, exercise)
        if a_category in ("식사", "운동"):
            continue

        # Check if this actual block was planned
        total_planned_overlap = 0
        a_duration = time_to_minutes(a_end) - time_to_minutes(a_start)
        if a_duration <= 0:
            continue

        for plan_block in plan:
            p_start = plan_block.get("start", "")
            p_end = plan_block.get("end", "")
            if p_start and p_end:
                ol = overlap_minutes(p_start, p_end, a_start, a_end)
                if ol > 0 and _categories_match(plan_block.get("category", ""), a_category):
                    total_planned_overlap += ol

        # If less than 50% of this block was planned, it's a distraction
        if total_planned_overlap < a_duration * 0.5 and a_category in distraction_cats:
            duration = a_duration
            if duration >= 5:  # Only report 5+ minute distractions
                distractions.append(f"{a_activity} {duration}분 ({a_start}~{a_end})")

    return distractions


def check_fixed_blocks(actual: list[dict]) -> tuple[bool, bool]:
    """Check if exercise and meal fixed blocks were followed."""
    exercise_done = False
    meals_done = 0

    meal_times = [("09:00", "09:30"), ("12:00", "13:00"), ("15:00", "15:20"), ("18:00", "18:30")]
    exercise_time = ("19:00", "20:00")

    for actual_block in actual:
        a_start = actual_block.get("start", "")
        a_end = actual_block.get("end", "")
        a_category = actual_block.get("category", "")

        if not a_start or not a_end:
            continue

        # Check exercise
        if overlap_minutes(a_start, a_end, exercise_time[0], exercise_time[1]) >= 30:
            if a_category in ("운동", "건강"):
                exercise_done = True

        # Check meals
        for m_start, m_end in meal_times:
            if overlap_minutes(a_start, a_end, m_start, m_end) >= 10:
                if a_category == "식사":
                    meals_done += 1

    return exercise_done, meals_done >= 3


def build_review(plan: list[dict], actual: list[dict]) -> dict:
    """Build the complete review object."""
    block_results = match_plan_vs_actual(plan, actual)
    distractions = find_distractions(plan, actual)
    exercise, meals = check_fixed_blocks(actual)

    # Overall adherence
    if block_results:
        adherence_pct = round(sum(b["match_pct"] for b in block_results) / len(block_results))
    else:
        adherence_pct = 0

    # Generate summary
    if adherence_pct >= 80:
        summary = "계획대로 잘 수행한 하루"
    elif adherence_pct >= 60:
        summary = "대체로 계획을 따랐지만 일부 이탈"
    elif adherence_pct >= 40:
        summary = "계획 이탈이 잦았던 하루"
    else:
        summary = "계획과 실제가 크게 달랐던 하루"

    if distractions:
        top_distraction = distractions[0].split(" ")[0]
        summary += f", 주요 이탈: {top_distraction}"

    return {
        "adherence_pct": adherence_pct,
        "blocks": block_results,
        "distractions": distractions[:5],
        "exercise": exercise,
        "meals": meals,
        "summary": summary,
    }


def build_trigger_message(date_str: str, review: dict, work_log: dict | None = None) -> str:
    """Build the trigger message for Claude to format and send."""
    now = datetime.now(KST)
    weekday = ["월", "화", "수", "목", "금", "토", "일"][now.weekday()]

    lines = [f"[저녁 리뷰 자동 트리거] {date_str} {weekday}요일\n"]

    lines.append(f"달성률: {review['adherence_pct']}%\n")

    if review["blocks"]:
        lines.append("블록별 결과:")
        for b in review["blocks"]:
            lines.append(f"  - {b['planned']}: {b['match_pct']}% — {b['actual_summary']}")
        lines.append("")

    if review["distractions"]:
        lines.append("이탈 포인트:")
        for d in review["distractions"]:
            lines.append(f"  - {d}")
        lines.append("")

    # Work log: Claude Code 세션에서 실제로 완성한 성과
    if work_log and work_log.get("entries"):
        lines.append(f"오늘 성과 (Claude Code {work_log.get('total_sessions', 0)}세션):")
        for e in work_log["entries"]:
            lines.append(f"  - [{e['time']}] {e['summary']}")
        lines.append("")

    lines.append(f"운동: {'완료' if review['exercise'] else '미완료'}")
    lines.append(f"식사: {'정상' if review['meals'] else '불규칙'}")
    lines.append("")

    lines.append("→ 위 데이터를 바탕으로 리뷰를 포맷팅해서 텔레그램으로 전송해주세요.")
    lines.append("  내일을 위한 팁도 하나 포함해주세요.")

    return "\n".join(lines)


async def save_review(date_str: str, review: dict) -> None:
    """Save review to daily_reports_v2.stats.review (spread merge)."""
    existing = await db._request(
        "GET",
        f"daily_reports_v2?report_date=eq.{date_str}&select=stats",
    )
    existing = existing or []
    existing_stats = existing[0]["stats"] if existing else {}
    if not existing_stats:
        existing_stats = {}

    new_stats = {**existing_stats, "review": review}

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
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            log.error("Invalid date format: %s (expected YYYY-MM-DD)", date_str)
            sys.exit(1)

    log.info("Running evening review for %s", date_str)

    # Load today's stats
    existing = await db._request(
        "GET",
        f"daily_reports_v2?report_date=eq.{date_str}&select=stats",
    )
    existing = existing or []
    stats = existing[0]["stats"] if existing else {}
    if not stats:
        stats = {}

    plan = stats.get("plan", [])
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except (json.JSONDecodeError, TypeError):
            log.warning("Plan was invalid string, resetting to []")
            plan = []
    if not isinstance(plan, list):
        plan = []

    actual = stats.get("actual", [])
    if isinstance(actual, str):
        try:
            actual = json.loads(actual)
        except (json.JSONDecodeError, TypeError):
            log.warning("Actual was invalid string, resetting to []")
            actual = []
    if not isinstance(actual, list):
        actual = []

    work_log = stats.get("work_log")

    log.info("Plan blocks: %d, Actual blocks: %d, Work log: %s",
             len(plan), len(actual), "yes" if work_log else "no")

    if not plan and not actual:
        log.info("No plan or actual data for %s, skipping review", date_str)
        return

    # Build review
    review = build_review(plan, actual)
    log.info("Review: adherence=%d%%, blocks=%d, distractions=%d",
             review["adherence_pct"], len(review["blocks"]), len(review["distractions"]))

    # Save review to DB
    await save_review(date_str, review)
    log.info("Saved review to daily_reports_v2 for %s", date_str)

    # Enqueue trigger message for Claude to process
    if not TELEGRAM_ALLOWED_USERS:
        log.error("No TELEGRAM_ALLOWED_USERS configured")
        sys.exit(1)

    message = build_trigger_message(date_str, review, work_log=work_log)
    log.info("Trigger message:\n%s", message)

    for chat_id in TELEGRAM_ALLOWED_USERS:
        try:
            result = await db.enqueue_message(
                chat_id=chat_id,
                content=message,
                sender="system",
                metadata={"type": "evening_review_trigger"},
            )
            log.info("Enqueued evening review trigger queue_id=%s chat_id=%s", result["id"], chat_id)
        except Exception as e:
            log.error("Failed to enqueue for chat_id=%s: %s", chat_id, e)


if __name__ == "__main__":
    asyncio.run(main())
