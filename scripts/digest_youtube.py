"""AI YouTube Digest Generator — Scout System.

Runs via systemd timer (morning 07:00, evening 19:00 KST).

Pipeline:
1. Multi-source collect (RSS + YouTube Search + Reddit + HN)
2. Signal-based scoring (viral + velocity + engagement + source_bonus)
3. Depth classification via Gemini CLI — batched + parallel
4. Summarize via Gemini CLI — parallel (5 concurrent)
5. Save to digests table (→ web UI auto-reflects)
6. Send formatted digest to Telegram

Claude token usage at runtime: 0 (all Python + Gemini CLI)

Usage:
  python3 -m scripts.digest_youtube               # auto-detect morning/evening
  python3 -m scripts.digest_youtube --mode morning # force mode
  python3 -m scripts.digest_youtube --mode evening
  python3 -m scripts.digest_youtube --dry-run      # no DB save, no Telegram
"""

import argparse
import asyncio
import html
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import (
    SUPABASE_REST_URL,
    SUPABASE_HEADERS,
    TELEGRAM_ALLOWED_USERS,
)
from bot import telegram_sender as tg
from scripts.collect_scout import collect_scout
from scripts.collect_youtube import load_seen_videos
from scripts.score_videos import score_and_filter

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("digest_youtube")

KST = timezone(timedelta(hours=9))

# ── Configuration ─────────────────────────────────────────────

GEMINI_CLI = "/home/john/.nvm/versions/node/v20.19.6/bin/gemini"
GEMINI_CLI_TIMEOUT = 60       # seconds per CLI call
MIN_DEPTH = 3                 # 1=news 2=beginner 3=intermediate 4=advanced 5=research
CONCURRENCY = 3               # parallel — CLI uses subscription, no RPM limit
DEPTH_BATCH_SIZE = 5          # videos per depth classification batch
TOTAL_TIME_BUDGET = 25 * 60   # 25 min — bail out before systemd 45min timeout
MAX_SUMMARIES = 35            # cap summaries

_start_time = None


def _time_remaining() -> float:
    """Seconds remaining in the time budget."""
    if _start_time is None:
        return TOTAL_TIME_BUDGET
    return TOTAL_TIME_BUDGET - (time.monotonic() - _start_time)


def _budget_expired() -> bool:
    return _time_remaining() <= 60  # less than 1 min left


# ── Gemini CLI helper ──

_gemini_consecutive_fail = 0  # consecutive failures

async def _gemini_cli_call(prompt: str, input_text: str = "") -> str:
    """Call Gemini CLI (subscription-based, no API quota). Returns response text or empty string."""
    global _gemini_consecutive_fail
    if _gemini_consecutive_fail >= 5:
        return ""

    full_text = f"{prompt}\n\n{input_text}" if input_text else prompt

    try:
        proc = await asyncio.create_subprocess_exec(
            GEMINI_CLI, "-p", full_text,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PATH": "/home/john/.nvm/versions/node/v20.19.6/bin:" + os.environ.get("PATH", "")},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=GEMINI_CLI_TIMEOUT)
        if proc.returncode == 0 and stdout:
            _gemini_consecutive_fail = 0
            return stdout.decode().strip()
        else:
            _gemini_consecutive_fail += 1
            err_msg = stderr.decode()[:100] if stderr else "no output"
            log.warning("Gemini CLI failed (rc=%s): %s", proc.returncode, err_msg)
            return ""
    except asyncio.TimeoutError:
        _gemini_consecutive_fail += 1
        log.warning("Gemini CLI timeout (%ds)", GEMINI_CLI_TIMEOUT)
        return ""
    except Exception as e:
        _gemini_consecutive_fail += 1
        log.warning("Gemini CLI error: %s", str(e)[:100])
        return ""


# ── Depth classification via Gemini CLI (batched + parallel) ──

async def _depth_batch(batch: list[dict], sem: asyncio.Semaphore) -> list[tuple[dict, int]]:
    """Classify a batch of videos' depth using a single Gemini API call."""
    async with sem:
        if _budget_expired():
            log.warning("Time budget expired, defaulting batch to depth=%d", MIN_DEPTH)
            return [(v, MIN_DEPTH) for v in batch]

        lines = []
        for idx, v in enumerate(batch, 1):
            title = v["title"]
            desc = v.get("description", "")[:200]
            entry = f"[{idx}] 제목: {title}"
            if desc:
                entry += f"\n    설명: {desc}"
            lines.append(entry)

        input_text = "\n".join(lines)
        prompt = (
            "아래 유튜브 영상들의 기술적 깊이를 각각 1~5점으로 평가해.\n"
            "1=뉴스나열/클릭베이트 2=입문설명 3=중급실전 4=고급구현 5=연구/논문급\n"
            f"각 영상에 대해 '번호:점수' 형식으로 {len(batch)}줄 출력. 설명 금지.\n"
            "예시:\n1:3\n2:4\n3:2"
        )

        output = await _gemini_cli_call(prompt, input_text)
        if not output:
            return [(v, MIN_DEPTH) for v in batch]

        # Parse "N:score" lines
        scores = {}
        for line in output.split("\n"):
            m = re.match(r'(\d+)\s*[:：]\s*([1-5])', line.strip())
            if m:
                scores[int(m.group(1))] = int(m.group(2))

        results = []
        for idx, v in enumerate(batch, 1):
            depth = scores.get(idx, MIN_DEPTH)
            results.append((v, depth))

        return results


async def depth_filter_parallel(videos: list[dict]) -> list[dict]:
    """Filter videos by depth using batched parallel Gemini CLI calls."""
    if not videos:
        return videos

    sem = asyncio.Semaphore(CONCURRENCY)
    batches = [videos[i:i + DEPTH_BATCH_SIZE] for i in range(0, len(videos), DEPTH_BATCH_SIZE)]

    log.info("Depth filter: %d videos in %d batches (concurrency=%d)",
             len(videos), len(batches), CONCURRENCY)

    tasks = [_depth_batch(batch, sem) for batch in batches]
    batch_results = await asyncio.gather(*tasks)

    result = []
    total = 0
    for batch_result in batch_results:
        for v, depth in batch_result:
            total += 1
            v["depth"] = depth
            if depth >= MIN_DEPTH:
                result.append(v)
                log.info("  [%d/%d] depth=%d ✓ %s", total, len(videos), depth, v["title"][:50])
            else:
                log.info("  [%d/%d] depth=%d ✗ %s (filtered)", total, len(videos), depth, v["title"][:50])

    log.info("Depth filter: %d/%d passed (min=%d)", len(result), len(videos), MIN_DEPTH)
    return result


# ── Gemini CLI Summarization (parallel) ──────────────────────

async def _summarize_one(video: dict, idx: int, total: int, sem: asyncio.Semaphore) -> str:
    """Summarize a single video using Gemini CLI."""
    async with sem:
        if _budget_expired():
            log.warning("Time budget expired, skipping summary for '%s'", video["title"][:40])
            return ""

        title = video["title"]
        channel = video.get("channel", "")
        description = video.get("description", "")

        if description and len(description.strip()) > 30:
            input_text = (
                f"유튜브 영상 제목: {title}\n"
                f"채널: {channel}\n"
                f"설명: {description}"
            )
        else:
            input_text = (
                f"유튜브 영상 제목: {title}\n"
                f"채널: {channel}"
            )

        prompt = (
            "너는 AI/코딩 기술 브리핑 전문가야. "
            "위 유튜브 영상 정보를 분석해서, 영상을 안 봐도 될 수준으로 핵심을 전달해줘.\n\n"
            "대상 독자: AI 도구(Claude Code, Codex, Gemini CLI)로 업무 자동화 시스템을 구축 중인 1인 개발자/사업가.\n\n"
            "형식: 개조식 3~4개 항목. 각 항목 앞에 ▸ 붙이고, 한 항목당 1문장(최대 50자).\n"
            "▸ 핵심 주제 한줄\n"
            "▸ 구체적 내용 1~2개\n"
            "▸ 실무 적용 포인트\n\n"
            "규칙: 서술형/장문 금지. 항목당 50자 이내 엄수. 전체 4줄 이내. "
            "서두/맺음말/부연설명 금지. ▸로 시작하는 항목만 출력. "
            "추가 검색 없이 주어진 정보만으로. 영상 추천/권유 문구 금지."
        )

        output = await _gemini_cli_call(prompt, input_text)
        if output:
            log.info("  [%d/%d] Summary OK: %s", idx, total, title[:50])
            return output
        else:
            log.error("  [%d/%d] Gemini CLI failed for '%s'", idx, total, title[:40])
            return ""


async def summarize_videos_parallel(videos: list[dict]) -> None:
    """Summarize videos sequentially with rate limiting."""
    sem = asyncio.Semaphore(CONCURRENCY)
    to_summarize = videos[:MAX_SUMMARIES]
    log.info("Summarizing %d/%d videos (concurrency=%d, via Gemini CLI)",
             len(to_summarize), len(videos), CONCURRENCY)

    tasks = [_summarize_one(v, i + 1, len(to_summarize), sem) for i, v in enumerate(to_summarize)]
    summaries = await asyncio.gather(*tasks)

    success = 0
    for video, summary in zip(to_summarize, summaries):
        video["summary"] = summary
        if summary:
            success += 1

    log.info("Summarization: %d/%d succeeded", success, len(to_summarize))


# ── Format for Telegram ───────────────────────────────────────

def format_view_count(count: int) -> str:
    if count >= 10000:
        return f"{count / 10000:.1f}만회"
    elif count >= 1000:
        return f"{count / 1000:.1f}천회"
    return f"{count}회" if count else ""


def format_duration(iso_duration: str) -> str:
    if not iso_duration:
        return ""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso_duration)
    if not m:
        return ""
    h, mi, s = m.groups()
    parts = []
    if h:
        parts.append(f"{h}시간")
    if mi:
        parts.append(f"{mi}분")
    if s and not h:
        parts.append(f"{s}초")
    return " ".join(parts)


def format_telegram_message(mode: str, date_str: str, videos: list[dict]) -> str:
    emoji = "🌅" if mode == "morning" else "🌙"
    label = "모닝" if mode == "morning" else "이브닝"

    lines = [f"{emoji} {label} AI 다이제스트 — {date_str}\n"]

    if not videos:
        lines.append("오늘은 특별한 AI 영상이 없습니다.")
        return "\n".join(lines)

    for i, v in enumerate(videos, 1):
        title = v["title"]
        channel = v.get("channel", "")
        video_id = v["video_id"]
        summary = v.get("summary", "")
        views = format_view_count(v.get("view_count", 0))
        duration = format_duration(v.get("duration", ""))

        lines.append(f"{i}. {title}")
        meta = []
        if channel:
            meta.append(f"📺 {channel}")
        if views:
            meta.append(f"👀 {views}")
        if duration:
            meta.append(f"⏱ {duration}")
        if meta:
            lines.append(f"   {' · '.join(meta)}")
        lines.append(f"   🔗 https://youtu.be/{video_id}")
        if summary:
            lines.append(f"\n{summary}")
        lines.append("")

    return "\n".join(lines)


# ── Save to DB ────────────────────────────────────────────────

async def save_digest(
    client: httpx.AsyncClient,
    date_str: str,
    mode: str,
    videos: list[dict],
) -> bool:
    db_videos = []
    for v in videos:
        db_videos.append({
            "video_id": v["video_id"],
            "title": v["title"],
            "channel": v.get("channel", ""),
            "view_count": v.get("view_count", 0),
            "duration": v.get("duration", ""),
            "summary": v.get("summary") or None,
            "published_at": v.get("published_at", ""),
        })

    label = "모닝" if mode == "morning" else "이브닝"
    header_text = f"{label} AI 유튜브 다이제스트"

    resp = await client.get(
        f"{SUPABASE_REST_URL}/digests",
        headers=SUPABASE_HEADERS,
        params={
            "digest_date": f"eq.{date_str}",
            "mode": f"eq.{mode}",
            "select": "id",
        },
    )
    existing = resp.json() if resp.status_code == 200 else []

    if existing:
        resp = await client.patch(
            f"{SUPABASE_REST_URL}/digests",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{existing[0]['id']}"},
            json={
                "videos": db_videos,
                "header": header_text,
                "video_count": len(db_videos),
            },
        )
    else:
        resp = await client.post(
            f"{SUPABASE_REST_URL}/digests",
            headers=SUPABASE_HEADERS,
            json={
                "digest_date": date_str,
                "mode": mode,
                "videos": db_videos,
                "header": header_text,
                "video_count": len(db_videos),
            },
        )

    if resp.status_code >= 300:
        log.error("DB save failed: %s %s", resp.status_code, resp.text[:200])
        return False

    log.info("Digest saved to DB: %s %s (%d videos)", date_str, mode, len(db_videos))
    return True


# ── Main ──────────────────────────────────────────────────────

async def main():
    global _start_time
    _start_time = time.monotonic()

    parser = argparse.ArgumentParser(description="AI YouTube Digest Generator")
    parser.add_argument(
        "--mode", choices=["morning", "evening"],
        help="Force morning or evening mode (default: auto-detect)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print digest without saving to DB or sending to Telegram",
    )
    args = parser.parse_args()

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")

    if args.mode:
        mode = args.mode
    else:
        mode = "morning" if now.hour < 14 else "evening"

    log.info("Generating %s digest for %s (Scout System)", mode, date_str)

    # 1) Multi-source collection (RSS + YouTube + Reddit + HN)
    log.info("Step 1: Multi-source collection...")
    seen = collect_scout()
    log.info("Step 1 done (%.0fs elapsed)", time.monotonic() - _start_time)

    # 2) Signal-based scoring & filtering
    log.info("Step 2: Scoring & filtering...")
    videos = score_and_filter(seen, mode)
    log.info("Step 2 done: %d candidates (%.0fs elapsed)", len(videos), time.monotonic() - _start_time)

    # 3) Depth classification — SKIPPED (depth filter가 영상 절반 이상 죽이는 주범이었음)
    # 30개 이상 출력을 위해 depth 필터링 제거. 수집→스코어→요약→전송 직행.
    log.info("Step 3: Depth filter skipped (30+ output guaranteed), %d candidates proceed",
             len(videos))

    if not videos:
        log.warning("No videos found after collection")
        telegram_text = format_telegram_message(mode, date_str, [])
        if not args.dry_run:
            for chat_id in TELEGRAM_ALLOWED_USERS:
                await tg.send_message(chat_id, telegram_text, parse_mode=None)
        return

    log.info("Loaded %d videos after scoring+depth filter, processing...", len(videos))

    # 4) Summarize using Gemini CLI — parallel
    await summarize_videos_parallel(videos)
    log.info("Step 4 done (%.0fs elapsed)", time.monotonic() - _start_time)

    # 5) Format
    telegram_text = format_telegram_message(mode, date_str, videos)

    if args.dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN — Telegram message:")
        print("=" * 60)
        print(telegram_text)
        print("=" * 60)
        print(f"\nVideos: {len(videos)}")
        elapsed = time.monotonic() - _start_time
        print(f"Total time: {elapsed:.0f}s ({elapsed/60:.1f}min)")
        return

    # 6) Save to DB
    async with httpx.AsyncClient() as client:
        saved = await save_digest(client, date_str, mode, videos)
        if not saved:
            log.error("DB save failed, continuing to Telegram send")

    # 7) Send to Telegram
    for chat_id in TELEGRAM_ALLOWED_USERS:
        sent = await tg.send_message(chat_id, telegram_text, parse_mode=None)
        if sent:
            log.info("Sent to Telegram chat_id=%s", chat_id)
        else:
            log.error("Failed to send to chat_id=%s", chat_id)

    elapsed = time.monotonic() - _start_time
    log.info("Digest complete: %s %s (%d videos, %.0fs elapsed)",
             date_str, mode, len(videos), elapsed)


if __name__ == "__main__":
    asyncio.run(main())
