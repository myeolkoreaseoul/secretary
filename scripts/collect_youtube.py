"""YouTube AI video collector for Secretary bot.

Searches and tracks popular Korean AI videos using YouTube Data API v3.
Ported from openclaw yt-digest/collect.py to run independently.

Usage:
  python3 -m scripts.collect_youtube          # normal collection
  python3 -m scripts.collect_youtube --dry-run # show results without saving
"""

import argparse
import html as html_mod
import json
import logging
import os
import re
import sys
import time
import tempfile
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import YOUTUBE_API_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("collect_youtube")

# ── Data directory ───────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data" / "yt-digest"

# ── Configuration ────────────────────────────────────────────
KEYWORDS = [
    "AI 코딩", "AI 에이전트", "AI 자동화",
    "바이브코딩", "클로드 코드", "커서 AI",
    "ChatGPT 활용", "생성형AI", "오픈클로",
    "LLM 활용",
]

SUBSCRIBE_CHANNELS = []  # 하드코딩 채널 전면 삭제 — 키워드 검색으로만 수집

SEARCH_CONFIG = {
    "region_code": "KR",
    "relevance_language": "ko",
    "max_results_per_keyword": 25,
    "lookback_hours": 48,
    "order": "date",
}

AI_KEYWORDS = [
    "ai 코딩", "ai 에이전트", "ai 비서", "ai 자동화", "ai 도구", "ai 활용",
    "ai 앱", "ai 서비스", "ai 개발", "ai agent",
    "llm", "gpt", "chatgpt", "claude", "gemini flash", "gemini pro",
    "copilot", "openai", "anthropic", "midjourney", "stable diffusion",
    "cursor ai", "codex", "mcp 서버", "mcp서버", "rag", "sora", "dall-e",
    "인공지능", "바이브코딩", "바이브 코딩", "vibe coding",
    "프롬프트 엔지니어링", "프롬프트엔지니어링", "생성형 ai", "생성형ai",
    "딥러닝", "머신러닝", "파인튜닝",
    "오픈클로", "openclaw", "클로드 코드", "클로드코드",
    "제미나이 활용", "챗봇 만들기", "챗봇 개발",
    "노코드 ai", "로우코드", "n8n 자동화",
    "에이전틱", "agentic", "안티그래비티", "antigravity",
]

BLOCKED_CHANNELS = ["KBS", "SBS", "MBC", "JTBC", "YTN", "채널A", "TV조선", "MBN"]

BLOCKED_TITLE_KEYWORDS = [
    "주가전망", "주가 전망", "종목추천", "종목 추천",
    "주식투자", "주식일타", "코인 투자", "코인 투자",
    "리딩방", "스타킹", "여비서", "실사화",
    "축구 승무패", "로또", "네이버 주가", "삼성전자 주가",
]

FILTERS = {
    "min_duration_seconds": 61,
    "max_duration_seconds": 5400,
    "require_korean_title": True,
    "require_ai_related": True,
    "exclude_shorts": True,
    "min_view_count": 10,
    "max_per_channel": 5,
}

STALE_HOURS = 96


# ── Utility functions ────────────────────────────────────────

def http_get_json(url: str, retries: int = 3, base_delay: int = 2) -> dict:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "secretary-yt/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError) as e:
            delay = base_delay * (2 ** attempt)
            if attempt < retries - 1:
                log.warning("HTTP retry %d/%d (%s), waiting %ds...", attempt + 1, retries, e, delay)
                time.sleep(delay)
            else:
                log.error("HTTP failed after %d attempts: %s", retries, e)
                raise


def is_korean_title(title: str) -> bool:
    title = html_mod.unescape(title)
    korean = len(re.findall(r'[가-힣]', title))
    total = len(re.findall(r'[가-힣a-zA-Z0-9]', title))
    if total == 0:
        return False
    return korean / total >= 0.3


def parse_iso_duration(iso_duration: str) -> int:
    if not iso_duration:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso_duration)
    if not m:
        return 0
    h, mi, s = m.groups()
    return int(h or 0) * 3600 + int(mi or 0) * 60 + int(s or 0)


def is_ai_related(video_info: dict) -> bool:
    title = html_mod.unescape(video_info.get("title", "")).lower()
    description = html_mod.unescape(video_info.get("description", ""))[:200].lower()
    text = f"{title} {description}"
    return any(kw.lower() in text for kw in AI_KEYWORDS)


def is_shorts(video_info: dict) -> bool:
    title = video_info.get("title", "").lower()
    description = video_info.get("description", "")[:300].lower()
    if "#shorts" in title or "#shorts" in description:
        return True
    if "#쇼츠" in title or "#쇼츠" in description:
        return True
    dur_sec = parse_iso_duration(video_info.get("duration", ""))
    if 0 < dur_sec <= 60:
        return True
    return False


def passes_filters(video_info: dict, is_subscription: bool = False) -> bool:
    # Korean title (skip for subscription channels)
    if not is_subscription and FILTERS["require_korean_title"]:
        if not is_korean_title(video_info.get("title", "")):
            return False

    # Duration
    dur_sec = parse_iso_duration(video_info.get("duration", ""))
    if FILTERS["min_duration_seconds"] > 0 and dur_sec > 0:
        if dur_sec < FILTERS["min_duration_seconds"]:
            return False
    if FILTERS["max_duration_seconds"] > 0 and dur_sec > 0:
        if dur_sec > FILTERS["max_duration_seconds"]:
            return False

    # Blocked channels
    channel = video_info.get("channel", "")
    for b in BLOCKED_CHANNELS:
        if b in channel:
            return False

    # Shorts
    if FILTERS["exclude_shorts"] and is_shorts(video_info):
        return False

    # AI relevance (always required, even for subscriptions)
    if FILTERS["require_ai_related"] and not is_ai_related(video_info):
        return False

    # Blocked title keywords
    title_lower = html_mod.unescape(video_info.get("title", "")).lower()
    for bkw in BLOCKED_TITLE_KEYWORDS:
        if bkw.lower() in title_lower:
            return False

    # Min view count
    if FILTERS["min_view_count"] > 0:
        views = video_info.get("view_count", 0)
        if views < FILTERS["min_view_count"]:
            return False

    return True


# ── YouTube API calls ────────────────────────────────────────

def youtube_search(api_key: str, keyword: str) -> list[dict]:
    published_after = (
        datetime.now(timezone.utc) - timedelta(hours=SEARCH_CONFIG["lookback_hours"])
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = urllib.parse.urlencode({
        "part": "snippet",
        "q": keyword,
        "type": "video",
        "regionCode": SEARCH_CONFIG["region_code"],
        "relevanceLanguage": SEARCH_CONFIG["relevance_language"],
        "order": SEARCH_CONFIG["order"],
        "maxResults": SEARCH_CONFIG["max_results_per_keyword"],
        "publishedAfter": published_after,
        "key": api_key,
    })
    url = f"https://www.googleapis.com/youtube/v3/search?{params}"
    data = http_get_json(url)
    results = []
    for item in data.get("items", []):
        vid = item.get("id", {}).get("videoId")
        if vid:
            snippet = item.get("snippet", {})
            results.append({
                "video_id": vid,
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt", ""),
                "description": snippet.get("description", ""),
            })
    return results


def youtube_get_video_details(api_key: str, video_ids: list[str]) -> dict:
    details = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        params = urllib.parse.urlencode({
            "part": "statistics,contentDetails",
            "id": ",".join(batch),
            "key": api_key,
        })
        url = f"https://www.googleapis.com/youtube/v3/videos?{params}"
        data = http_get_json(url)
        for item in data.get("items", []):
            vid = item["id"]
            stats = item.get("statistics", {})
            content = item.get("contentDetails", {})
            details[vid] = {
                "view_count": int(stats.get("viewCount", 0)),
                "like_count": int(stats.get("likeCount", 0)),
                "duration": content.get("duration", ""),
            }
    return details


def youtube_get_channel_stats(api_key: str, channel_ids: list[str]) -> dict:
    """Fetch subscriber counts for channels. Returns {channel_id: subscriber_count}."""
    stats = {}
    for i in range(0, len(channel_ids), 50):
        batch = channel_ids[i:i + 50]
        params = urllib.parse.urlencode({
            "part": "statistics",
            "id": ",".join(batch),
            "key": api_key,
        })
        url = f"https://www.googleapis.com/youtube/v3/channels?{params}"
        try:
            data = http_get_json(url)
            for item in data.get("items", []):
                stats[item["id"]] = int(item["statistics"].get("subscriberCount", 0))
        except Exception as e:
            log.warning("Channel stats fetch failed: %s", e)
    return stats


def youtube_get_channel_uploads(api_key: str, channel_id: str, lookback_hours: int) -> list[dict]:
    uploads_playlist = "UU" + channel_id[2:]
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)

    params = urllib.parse.urlencode({
        "part": "snippet",
        "playlistId": uploads_playlist,
        "maxResults": 50,
        "key": api_key,
    })
    url = f"https://www.googleapis.com/youtube/v3/playlistItems?{params}"

    try:
        data = http_get_json(url)
    except Exception as e:
        log.error("Channel uploads fetch failed: %s", e)
        return []

    results = []
    for item in data.get("items", []):
        snippet = item.get("snippet", {})
        published = snippet.get("publishedAt", "")
        if published:
            try:
                pub_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
                if pub_dt < cutoff:
                    break
            except (ValueError, TypeError):
                pass
        vid = snippet.get("resourceId", {}).get("videoId")
        if vid:
            results.append({
                "video_id": vid,
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "published_at": published,
                "description": snippet.get("description", ""),
            })
    return results


# ── Data persistence ─────────────────────────────────────────

def load_seen_videos() -> dict:
    path = DATA_DIR / "seen_videos.json"
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Corrupted seen_videos.json, trying backup: %s", e)
            bak = path.with_suffix(".json.bak")
            if bak.exists():
                try:
                    with open(bak, "r", encoding="utf-8") as f:
                        return json.load(f)
                except (json.JSONDecodeError, OSError) as e:
                    log.warning("Backup also corrupted: %s. Starting fresh.", e)
    return {}


def save_seen_videos(seen: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "seen_videos.json"
    bak = path.with_suffix(".json.bak")
    if path.exists():
        try:
            os.replace(path, bak)
        except OSError:
            pass
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(seen, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, str(path))
    except Exception:
        os.unlink(tmp_path)
        raise


def purge_stale(seen: dict) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_HOURS)
    to_remove = []
    for vid, info in seen.items():
        first_seen = info.get("first_seen", "")
        if not first_seen:
            continue
        try:
            fs_dt = datetime.fromisoformat(first_seen.replace("Z", "+00:00"))
            if fs_dt < cutoff:
                to_remove.append(vid)
        except (ValueError, TypeError):
            pass
    for vid in to_remove:
        del seen[vid]
    if to_remove:
        log.info("Purged %d stale entries", len(to_remove))
    return seen


# ── Main collection ──────────────────────────────────────────

def collect(dry_run: bool = False) -> dict:
    if not YOUTUBE_API_KEY:
        log.error("YOUTUBE_API_KEY not set")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    seen = load_seen_videos()
    seen = purge_stale(seen)

    all_video_ids = set()
    new_videos = {}
    subscription_vids = set()
    use_searxng = False

    # Phase 1: Subscribed channels (1 quota unit each)
    for ch in SUBSCRIBE_CHANNELS:
        ch_id = ch["id"]
        ch_name = ch.get("name", ch_id)
        log.info("Channel: %s", ch_name)
        try:
            results = youtube_get_channel_uploads(
                YOUTUBE_API_KEY, ch_id, SEARCH_CONFIG["lookback_hours"]
            )
            log.info("  %d recent uploads", len(results))
            for v in results:
                vid = v["video_id"]
                all_video_ids.add(vid)
                subscription_vids.add(vid)
                if vid not in seen:
                    new_videos[vid] = v
        except Exception as e:
            log.error("  Channel error: %s", e)

    # Phase 2: Keyword search
    for keyword in KEYWORDS:
        log.info("Searching: %s", keyword)
        if use_searxng:
            log.info("  Skipping (API quota exceeded)")
            continue
        try:
            results = youtube_search(YOUTUBE_API_KEY, keyword)
            log.info("  YouTube API: %d results", len(results))
        except Exception as e:
            error_str = str(e)
            if "403" in error_str or "quotaExceeded" in error_str:
                log.warning("YouTube API quota exceeded, stopping keyword search")
                use_searxng = True
                continue
            else:
                log.error("YouTube API error: %s", e)
                continue

        for v in results:
            vid = v["video_id"]
            all_video_ids.add(vid)
            if vid not in seen:
                new_videos[vid] = v

    if not all_video_ids:
        log.info("No videos found")
        if not dry_run:
            save_seen_videos(seen)
        return seen

    # Fetch details for all videos
    log.info("Fetching details for %d videos...", len(all_video_ids))
    try:
        if not use_searxng:
            details = youtube_get_video_details(YOUTUBE_API_KEY, list(all_video_ids))
        else:
            details = {}
            log.info("  Skipping details (quota exceeded)")
    except Exception as e:
        log.error("Details fetch failed: %s", e)
        details = {}

    now_iso = datetime.now(timezone.utc).isoformat()

    # Update seen_videos
    for vid in all_video_ids:
        det = details.get(vid, {})
        if vid in seen:
            if det:
                seen[vid]["view_count"] = det.get("view_count", seen[vid].get("view_count", 0))
                seen[vid]["like_count"] = det.get("like_count", seen[vid].get("like_count", 0))
                seen[vid]["last_checked"] = now_iso
        else:
            nv = new_videos.get(vid, {})
            seen[vid] = {
                "title": nv.get("title", ""),
                "channel": nv.get("channel", ""),
                "description": nv.get("description", ""),
                "published_at": nv.get("published_at", ""),
                "first_seen": now_iso,
                "last_checked": now_iso,
                "view_count": det.get("view_count", 0),
                "like_count": det.get("like_count", 0),
                "duration": det.get("duration", ""),
                "source": "subscription" if vid in subscription_vids else "keyword",
            }

    # Apply filters
    has_details = len(details) > 0
    filtered_vids = set()
    channel_count = {}
    max_per_channel = FILTERS["max_per_channel"]

    for vid in all_video_ids:
        info = seen.get(vid, {})
        is_sub = vid in subscription_vids

        # Skip duration/view filters if no details (quota exceeded)
        if not has_details:
            if is_ai_related(info) and is_korean_title(info.get("title", "")):
                filtered_vids.add(vid)
            continue

        if passes_filters(info, is_subscription=is_sub):
            ch = info.get("channel", "unknown")
            channel_count[ch] = channel_count.get(ch, 0) + 1
            if channel_count[ch] > max_per_channel:
                log.info("  Channel limit (%d): %s", max_per_channel, info.get("title", vid)[:60])
                if vid in new_videos:
                    seen.pop(vid, None)
                continue
            filtered_vids.add(vid)
        else:
            log.info("  Filtered out: %s", info.get("title", vid)[:60])
            if vid in new_videos:
                seen.pop(vid, None)

    log.info("After filters: %d/%d videos passed", len(filtered_vids), len(all_video_ids))

    if not dry_run:
        save_seen_videos(seen)

    new_count = len([v for v in new_videos if v in filtered_vids])
    log.info("Collection done: %d new, %d total filtered, %d tracked", new_count, len(filtered_vids), len(seen))
    return seen


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="YouTube AI video collector")
    parser.add_argument("--dry-run", action="store_true", help="Don't save results")
    args = parser.parse_args()

    try:
        collect(dry_run=args.dry_run)
    except Exception as e:
        log.error("FATAL: %s", e)
        sys.exit(1)
