"""YouTube Trending Digest — 5개국 인기 동영상 다이제스트.

매일 09:00 KST 실행.
- KR/US/JP: YouTube mostPopular API (페이지네이션, 200개 수집)
- TW/SG: YouTube Search API (mostPopular 미지원 → 최근 24시간 최다조회 수집)
- 음악/게임/뮤비 필터 후 국가당 20개 표시

Usage:
  python3 -m scripts.digest_trending               # normal
  python3 -m scripts.digest_trending --dry-run      # no DB, no Telegram
"""

import argparse
import asyncio
import json
import logging
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import (
    YOUTUBE_API_KEY,
    SUPABASE_REST_URL,
    SUPABASE_HEADERS,
    TELEGRAM_ALLOWED_USERS,
)
from bot import telegram_sender as tg

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("digest_trending")

KST = timezone(timedelta(hours=9))

# ── Configuration ─────────────────────────────────────────────

REGIONS = [
    {"code": "KR", "name": "한국", "flag": "\U0001f1f0\U0001f1f7", "method": "popular"},
    {"code": "US", "name": "미국", "flag": "\U0001f1fa\U0001f1f8", "method": "popular"},
    {"code": "JP", "name": "일본", "flag": "\U0001f1ef\U0001f1f5", "method": "popular"},
]

# mostPopular: 페이지네이션으로 최대 100개 수집 (쿼터 절약)
MAX_RESULTS_PER_PAGE = 50
MAX_PAGES_POPULAR = 2     # 2 × 50 = 100

# search: TW/SG 제거 (mostPopular 미지원 + search API 쿼터 소모 큼)
MAX_PAGES_SEARCH = 1      # 사용 안 함

DISPLAY_TOP = 20  # 필터 후 국가당 표시 개수

# 필터링: 제외할 카테고리
EXCLUDED_CATEGORIES = {"1", "10", "20"}  # 영화/애니, 음악, 게임

# 필터링: 제목에 이 키워드 포함 시 뮤비로 간주하여 제외
MV_KEYWORDS = [
    "MV", "M/V", "Music Video", "Official Audio", "Official MV",
    "뮤직비디오", "Official Lyric", "Lyric Video", "Official Music",
]

# YouTube 카테고리 ID → 한글 이름
CATEGORY_MAP = {
    "1": "영화/애니", "2": "자동차", "10": "음악",
    "15": "동물", "17": "스포츠", "18": "단편영화",
    "19": "여행/이벤트", "20": "게임", "21": "블로그",
    "22": "인물/블로그", "23": "코미디", "24": "엔터",
    "25": "뉴스/정치", "26": "노하우/스타일", "27": "교육",
    "28": "과학/기술", "29": "비영리/사회",
}

DATA_DIR = Path(__file__).parent.parent / "data" / "trending"


# ── YouTube API ───────────────────────────────────────────────

def http_get_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "secretary-trending/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def _parse_video_item(item: dict, rank: int) -> dict:
    """videos.list 응답 item을 표준 dict로 변환."""
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    content = item.get("contentDetails", {})
    return {
        "rank": rank,
        "video_id": item["id"] if isinstance(item["id"], str) else item["id"].get("videoId", ""),
        "title": snippet.get("title", ""),
        "channel": snippet.get("channelTitle", ""),
        "channel_id": snippet.get("channelId", ""),
        "category_id": snippet.get("categoryId", ""),
        "category": CATEGORY_MAP.get(snippet.get("categoryId", ""), "기타"),
        "published_at": snippet.get("publishedAt", ""),
        "description": snippet.get("description", "")[:200],
        "views": int(stats.get("viewCount", 0)),
        "likes": int(stats.get("likeCount", 0)),
        "comments": int(stats.get("commentCount", 0)),
        "duration": content.get("duration", ""),
        "url": f"https://youtu.be/{item['id'] if isinstance(item['id'], str) else item['id'].get('videoId', '')}",
    }


def fetch_trending_popular(region_code: str) -> list[dict]:
    """YouTube mostPopular API로 국가별 인기 동영상 수집 (페이지네이션)."""
    all_videos = []
    page_token = None

    for page in range(MAX_PAGES_POPULAR):
        params = {
            "part": "snippet,statistics,contentDetails",
            "chart": "mostPopular",
            "regionCode": region_code,
            "maxResults": MAX_RESULTS_PER_PAGE,
            "key": YOUTUBE_API_KEY,
        }
        if page_token:
            params["pageToken"] = page_token

        url = f"https://www.googleapis.com/youtube/v3/videos?{urllib.parse.urlencode(params)}"
        data = http_get_json(url)

        for item in data.get("items", []):
            rank = len(all_videos) + 1
            all_videos.append(_parse_video_item(item, rank))

        page_token = data.get("nextPageToken")
        if not page_token:
            break

        log.info("  page %d: %d videos so far", page + 1, len(all_videos))

    return all_videos


def fetch_video_details(video_ids: list[str]) -> dict[str, dict]:
    """video ID 목록으로 상세정보(statistics, contentDetails) 조회."""
    details = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        params = urllib.parse.urlencode({
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(batch),
            "key": YOUTUBE_API_KEY,
        })
        url = f"https://www.googleapis.com/youtube/v3/videos?{params}"
        data = http_get_json(url)
        for item in data.get("items", []):
            details[item["id"]] = item
    return details


def fetch_trending_search(region_code: str) -> list[dict]:
    """YouTube Search API로 최근 24시간 최다조회 영상 수집 (TW/SG용)."""
    now = datetime.now(timezone.utc)
    published_after = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

    video_ids = []
    page_token = None

    for page in range(MAX_PAGES_SEARCH):
        params = {
            "part": "id",
            "type": "video",
            "regionCode": region_code,
            "order": "viewCount",
            "publishedAfter": published_after,
            "maxResults": MAX_RESULTS_PER_PAGE,
            "key": YOUTUBE_API_KEY,
        }
        if page_token:
            params["pageToken"] = page_token

        url = f"https://www.googleapis.com/youtube/v3/search?{urllib.parse.urlencode(params)}"
        data = http_get_json(url)

        for item in data.get("items", []):
            vid = item.get("id", {}).get("videoId")
            if vid:
                video_ids.append(vid)

        page_token = data.get("nextPageToken")
        if not page_token:
            break

        log.info("  search page %d: %d video IDs", page + 1, len(video_ids))

    if not video_ids:
        return []

    # 상세정보 조회 (statistics, contentDetails 포함)
    details = fetch_video_details(video_ids)

    videos = []
    for vid in video_ids:
        if vid in details:
            rank = len(videos) + 1
            videos.append(_parse_video_item(details[vid], rank))

    # 조회수 순으로 재정렬
    videos.sort(key=lambda v: v["views"], reverse=True)
    for i, v in enumerate(videos, 1):
        v["rank"] = i

    return videos


# ── Filtering ────────────────────────────────────────────────

def _is_mv_title(title: str) -> bool:
    """제목에 뮤비 관련 키워드가 포함되면 True."""
    title_upper = title.upper()
    for kw in MV_KEYWORDS:
        if kw.upper() in title_upper:
            return True
    return False


def filter_videos(videos: list[dict]) -> list[dict]:
    """음악/게임/뮤비 카테고리 및 키워드 필터링."""
    filtered = []
    for v in videos:
        # 카테고리 제외
        if v.get("category_id") in EXCLUDED_CATEGORIES:
            continue
        # 뮤비 키워드 제외
        if _is_mv_title(v.get("title", "")):
            continue
        filtered.append(v)

    # 필터 후 순위 재부여
    for i, v in enumerate(filtered, 1):
        v["rank"] = i

    return filtered


# ── Formatting ────────────────────────────────────────────────

def format_views(n: int) -> str:
    """조회수를 한국식으로 축약."""
    if n >= 100_000_000:
        return f"{n / 100_000_000:.1f}억"
    if n >= 10_000_000:
        return f"{n / 10_000:.0f}만"
    if n >= 10_000:
        return f"{n / 10_000:.1f}만"
    if n >= 1_000:
        return f"{n / 1_000:.1f}천"
    return str(n)


def format_duration(iso_duration: str) -> str:
    """PT1H2M3S → 1:02:03."""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso_duration or "")
    if not m:
        return ""
    h, mi, s = int(m.group(1) or 0), int(m.group(2) or 0), int(m.group(3) or 0)
    if h > 0:
        return f"{h}:{mi:02d}:{s:02d}"
    return f"{mi}:{s:02d}"


def build_digest(all_data: dict[str, list]) -> str:
    """텔레그램 다이제스트 메시지 생성."""
    now_kst = datetime.now(KST)
    date_str = now_kst.strftime("%Y-%m-%d")
    lines = [f"\U0001f4ca YouTube Trending \u2014 {date_str}"]
    lines.append("\u266b\u2694\ufe0f\U0001f3ac \uc74c\uc545/\uac8c\uc784/\ubba4\ube44 \uc81c\uc678 \u00b7 \uad6d\uac00\ub2f9 Top 20\n")

    for region in REGIONS:
        code = region["code"]
        videos = all_data.get(code, [])
        method_tag = "search" if region["method"] == "search" else "popular"

        if not videos:
            lines.append(f"{region['flag']} {region['name']} \u2014 \ub370\uc774\ud130 \uc5c6\uc74c ({method_tag})")
            lines.append("")
            continue

        lines.append(f"{region['flag']} {region['name']} Top {min(DISPLAY_TOP, len(videos))} ({method_tag})")
        lines.append("")

        for v in videos[:DISPLAY_TOP]:
            rank = v["rank"]
            views = format_views(v["views"])
            dur = format_duration(v["duration"])
            cat = v["category"]
            title = v["title"]
            if len(title) > 35:
                title = title[:33] + "\u2026"

            lines.append(f"  {rank:>2}. [{cat}] {title}")
            lines.append(f"      \U0001f441 {views} \u00b7 \u23f1 {dur} \u00b7 {v['channel']}")
            lines.append(f"      {v['url']}")

        lines.append("")

        # 카테고리 분포 (필터 후 기준)
        cat_count: dict[str, int] = {}
        for v in videos[:DISPLAY_TOP]:
            cat_count[v["category"]] = cat_count.get(v["category"], 0) + 1
        top_cats = sorted(cat_count.items(), key=lambda x: -x[1])[:5]
        cat_str = " \u00b7 ".join(f"{c}({n})" for c, n in top_cats)
        lines.append(f"  \U0001f4c2 \uce74\ud14c\uace0\ub9ac: {cat_str}")

        # 100만+ 영상
        million_plus = [v for v in videos[:DISPLAY_TOP] if v["views"] >= 1_000_000]
        if million_plus:
            lines.append(f"  \U0001f525 100\ub9cc+ \uc870\ud68c: {len(million_plus)}\uac1c")

        lines.append("")
        lines.append("\u2500" * 30)
        lines.append("")

    # 크로스컨트리 비교 (필터 후 1위)
    lines.append("\U0001f4a1 \ud06c\ub85c\uc2a4\ucee8\ud2b8\ub9ac 1\uc704 \ube44\uad50")
    for region in REGIONS:
        code = region["code"]
        videos = all_data.get(code, [])
        if videos:
            top = videos[0]
            title = top['title'][:30]
            lines.append(f"  {region['flag']} {title} ({format_views(top['views'])})")

    return "\n".join(lines)


# ── Data persistence ──────────────────────────────────────────

def save_json(all_data: dict[str, list], raw_data: dict[str, list]) -> Path:
    """JSON 파일로 히스토리 저장."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filepath = DATA_DIR / f"trending_{date_str}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(
            {
                "collected_at": datetime.now(timezone.utc).isoformat(),
                "filter": "excluded: 음악(10), 게임(20), 영화/애니(1), MV keywords",
                "regions": all_data,
                "raw_counts": {k: len(v) for k, v in raw_data.items()},
            },
            f, ensure_ascii=False, indent=2,
        )
    log.info("Saved to %s", filepath)
    return filepath


async def save_digest_db(client: httpx.AsyncClient, date_str: str, all_data: dict) -> bool:
    """Supabase digests 테이블에 저장."""
    db_videos = []
    for region in REGIONS:
        code = region["code"]
        for v in all_data.get(code, [])[:DISPLAY_TOP]:
            db_videos.append({
                "video_id": v["video_id"],
                "title": v["title"],
                "channel": v["channel"],
                "view_count": v["views"],
                "duration": v["duration"],
                "category": v["category"],
                "region": code,
                "rank": v["rank"],
                "published_at": v.get("published_at", ""),
            })

    resp = await client.get(
        f"{SUPABASE_REST_URL}/digests",
        headers=SUPABASE_HEADERS,
        params={"digest_date": f"eq.{date_str}", "mode": "eq.trending", "select": "id"},
    )
    existing = resp.json() if resp.status_code == 200 else []

    payload = {
        "videos": db_videos,
        "header": "YouTube Trending \ub2e4\uc774\uc81c\uc2a4\ud2b8",
        "video_count": len(db_videos),
    }

    if existing:
        resp = await client.patch(
            f"{SUPABASE_REST_URL}/digests",
            headers=SUPABASE_HEADERS,
            params={"id": f"eq.{existing[0]['id']}"},
            json=payload,
        )
    else:
        payload["digest_date"] = date_str
        payload["mode"] = "trending"
        resp = await client.post(
            f"{SUPABASE_REST_URL}/digests",
            headers=SUPABASE_HEADERS,
            json=payload,
        )

    if resp.status_code >= 300:
        log.error("DB save failed: %s %s", resp.status_code, resp.text[:200])
        return False

    log.info("Digest saved to DB: %s trending (%d videos)", date_str, len(db_videos))
    return True


# ── Main ──────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="YouTube Trending Digest")
    parser.add_argument("--dry-run", action="store_true", help="Print only, no DB/Telegram")
    args = parser.parse_args()

    if not YOUTUBE_API_KEY:
        log.error("YOUTUBE_API_KEY not set")
        sys.exit(1)

    now_kst = datetime.now(KST)
    date_str = now_kst.strftime("%Y-%m-%d")

    log.info("Collecting YouTube Trending for %s", date_str)

    raw_data: dict[str, list] = {}
    filtered_data: dict[str, list] = {}

    for region in REGIONS:
        code = region["code"]
        method = region["method"]
        log.info("%s %s (%s) collecting via %s...", region["flag"], region["name"], code, method)

        try:
            if method == "popular":
                videos = fetch_trending_popular(code)
            else:
                videos = fetch_trending_search(code)

            raw_data[code] = videos
            raw_count = len(videos)

            # 필터링 적용
            videos = filter_videos(videos)
            filtered_data[code] = videos

            total_views = sum(v["views"] for v in videos[:DISPLAY_TOP])
            log.info("  raw: %d → filtered: %d, top-%d views: %s",
                     raw_count, len(videos), DISPLAY_TOP, format_views(total_views))

        except Exception as e:
            log.error("  Failed: %s", e)
            raw_data[code] = []
            filtered_data[code] = []

    # Build digest
    digest_text = build_digest(filtered_data)

    if args.dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN — Telegram message:")
        print("=" * 60)
        print(digest_text)
        print("=" * 60)
        for region in REGIONS:
            code = region["code"]
            raw = len(raw_data.get(code, []))
            filt = len(filtered_data.get(code, []))
            print(f"  {code}: raw={raw} → filtered={filt}")
        return

    # Save JSON (필터된 데이터 + raw 카운트) — dry-run이 아닐 때만
    save_json(filtered_data, raw_data)

    # Save to DB
    try:
        async with httpx.AsyncClient() as client:
            await save_digest_db(client, date_str, filtered_data)
    except Exception as e:
        log.warning("DB save failed (non-fatal): %s", e)

    # Send to Telegram
    for chat_id in TELEGRAM_ALLOWED_USERS:
        sent = await tg.send_message(chat_id, digest_text, parse_mode=None)
        if sent:
            log.info("Sent to Telegram chat_id=%s", chat_id)
        else:
            log.error("Failed to send to chat_id=%s", chat_id)

    total_filtered = sum(len(v) for v in filtered_data.values())
    log.info("Trending digest complete: %s (%d filtered videos)", date_str, total_filtered)


if __name__ == "__main__":
    asyncio.run(main())
