"""Multi-source YouTube AI video collector (Scout System).

Collects from 4 sources:
  1. RSS feeds for subscribed channels (0 API quota)
  2. YouTube Data API keyword search
  3. Reddit JSON API (r/LocalLLaMA, r/ClaudeAI, etc.)
  4. HackerNews Algolia API

Usage:
  python3 -m scripts.collect_scout          # normal collection
  python3 -m scripts.collect_scout --dry-run # show results without saving
"""

import argparse
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import feedparser

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import YOUTUBE_API_KEY
from scripts.collect_youtube import (
    http_get_json,
    is_ai_related,
    is_korean_title,
    passes_filters,
    is_shorts,
    parse_iso_duration,
    youtube_search,
    youtube_get_video_details,
    youtube_get_channel_stats,
    load_seen_videos,
    save_seen_videos,
    purge_stale,
    SUBSCRIBE_CHANNELS,
    KEYWORDS,
    SEARCH_CONFIG,
    BLOCKED_CHANNELS,
    BLOCKED_TITLE_KEYWORDS,
    DATA_DIR,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("collect_scout")

# ── English AI keywords (for Reddit/HN content) ─────────────
AI_KEYWORDS_EN = [
    "ai agent", "ai coding", "ai automation", "claude code", "cursor ai",
    "vibe coding", "llm", "rag", "mcp server", "agentic", "openai",
    "anthropic", "chatgpt", "gemini", "copilot", "midjourney",
    "stable diffusion", "codex", "dall-e", "sora", "fine-tuning",
    "prompt engineering", "deep learning", "machine learning",
    "local llm", "ollama", "langchain", "autogen", "crewai",
    "computer use", "browser use", "ai assistant", "ai tool",
    "gpt-5", "claude 4", "gemini 3", "llama", "mistral",
    "open source ai", "ai workflow", "n8n", "zapier ai",
]

# ── Reddit configuration ─────────────────────────────────────
REDDIT_SUBREDDITS = [
    "LocalLLaMA",
    "ClaudeAI",
    "singularity",
    "artificial",
    "MachineLearning",
]
REDDIT_DELAY = 2  # seconds between requests

# ── YouTube video ID regex ───────────────────────────────────
YT_VIDEO_ID_RE = re.compile(
    r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})'
)


# ── Source 1: RSS feeds (0 API quota) ────────────────────────

def collect_rss(channels: list[dict], lookback_hours: int = 28) -> list[dict]:
    """Collect recent videos from subscribed channels via RSS."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    results = []

    for ch in channels:
        ch_id = ch["id"]
        ch_name = ch.get("name", ch_id)
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={ch_id}"

        feed = None
        for attempt in range(3):
            try:
                feed = feedparser.parse(url)
                if feed.bozo and not feed.entries:
                    raise ValueError(f"Feed parse error: {feed.bozo_exception}")
                break
            except Exception as e:
                if attempt < 2:
                    log.warning("RSS retry %d/3 for %s: %s", attempt + 1, ch_name, e)
                    time.sleep(2)
                else:
                    log.error("RSS failed for %s after 3 attempts: %s", ch_name, e)
                    feed = None

        if not feed or not feed.entries:
            continue

        count = 0
        for entry in feed.entries:
            # Parse published date
            published = entry.get("published", "")
            try:
                pub_dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                if pub_dt < cutoff:
                    break  # RSS is sorted newest first
            except (TypeError, AttributeError):
                pass

            video_id = entry.get("yt_videoid", "")
            if not video_id:
                # Try extracting from link
                link = entry.get("link", "")
                m = YT_VIDEO_ID_RE.search(link)
                if m:
                    video_id = m.group(1)

            if video_id:
                results.append({
                    "video_id": video_id,
                    "title": entry.get("title", ""),
                    "channel": ch_name,
                    "published_at": published,
                    "description": entry.get("summary", "")[:500],
                    "source": "rss",
                })
                count += 1

        log.info("RSS %s: %d videos", ch_name, count)

    return results


# ── Source 2: YouTube Search (reuse existing) ────────────────

def collect_youtube_keywords(api_key: str, keywords: list[str]) -> list[dict]:
    """Collect via YouTube Data API keyword search."""
    results = []
    quota_exceeded = False

    for keyword in keywords:
        if quota_exceeded:
            log.info("  Skipping '%s' (quota exceeded)", keyword)
            continue

        log.info("YouTube Search: %s", keyword)
        try:
            vids = youtube_search(api_key, keyword)
            log.info("  → %d results", len(vids))
            for v in vids:
                v["source"] = "youtube"
                results.append(v)
        except Exception as e:
            error_str = str(e)
            if "403" in error_str or "quotaExceeded" in error_str:
                log.warning("YouTube API quota exceeded, stopping keyword search")
                quota_exceeded = True
            else:
                log.error("YouTube API error for '%s': %s", keyword, e)

    return results


# ── Source 3: Reddit ─────────────────────────────────────────

def collect_reddit(subreddits: list[str]) -> list[dict]:
    """Collect YouTube links from Reddit posts."""
    results = []

    for sub in subreddits:
        url = (
            f"https://www.reddit.com/r/{sub}/search.json"
            f"?q=url:youtube.com+OR+url:youtu.be&sort=top&t=day&limit=25"
        )

        try:
            import urllib.request
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "secretary-scout/1.0 (AI digest bot)"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "json" not in content_type:
                    log.warning("Reddit r/%s returned non-JSON (Content-Type: %s), skipping", sub, content_type)
                    time.sleep(REDDIT_DELAY)
                    continue
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            log.error("Reddit r/%s failed: %s", sub, e)
            time.sleep(REDDIT_DELAY)
            continue

        posts = data.get("data", {}).get("children", [])
        count = 0
        for post in posts:
            pdata = post.get("data", {})
            post_url = pdata.get("url", "")
            title = pdata.get("title", "")
            reddit_score = pdata.get("score", 0)

            m = YT_VIDEO_ID_RE.search(post_url)
            if m:
                results.append({
                    "video_id": m.group(1),
                    "title": title,
                    "channel": "",  # Will be filled by YouTube API
                    "published_at": "",
                    "description": pdata.get("selftext", "")[:300],
                    "source": "reddit",
                    "reddit_score": reddit_score,
                    "reddit_sub": sub,
                })
                count += 1

        log.info("Reddit r/%s: %d YouTube links", sub, count)
        time.sleep(REDDIT_DELAY)

    return results


# ── Source 4: HackerNews ─────────────────────────────────────

def collect_hackernews() -> list[dict]:
    """Collect YouTube links from HackerNews stories."""
    url = (
        "https://hn.algolia.com/api/v1/search"
        "?query=youtube.com"
        "&tags=story"
        "&numericFilters=points>30"
        "&hitsPerPage=50"
    )

    results = []
    cutoff_ts = int((datetime.now(timezone.utc) - timedelta(hours=48)).timestamp())
    try:
        data = http_get_json(url)
    except Exception as e:
        log.error("HackerNews API failed: %s", e)
        return results

    for hit in data.get("hits", []):
        # Filter to 48h window using numeric timestamp
        created_at_i = hit.get("created_at_i", 0)
        if created_at_i and created_at_i < cutoff_ts:
            continue
        story_url = hit.get("url", "")
        m = YT_VIDEO_ID_RE.search(story_url)
        if m:
            results.append({
                "video_id": m.group(1),
                "title": hit.get("title", ""),
                "channel": "",
                "published_at": "",
                "description": "",
                "source": "hackernews",
                "hn_points": hit.get("points", 0),
            })

    log.info("HackerNews: %d YouTube links", len(results))
    return results


# ── Merge & deduplicate ──────────────────────────────────────

def merge_candidates(*source_lists: list[dict]) -> dict[str, dict]:
    """Merge all sources, deduplicate by video_id, track multi-source."""
    merged = {}

    for source_list in source_lists:
        for v in source_list:
            vid = v["video_id"]
            if vid in merged:
                # Add source to existing entry
                existing_sources = merged[vid].get("sources", [merged[vid].get("source", "unknown")])
                new_source = v.get("source", "unknown")
                if new_source not in existing_sources:
                    existing_sources.append(new_source)
                merged[vid]["sources"] = existing_sources
                # Keep reddit/hn metadata
                if "reddit_score" in v:
                    merged[vid]["reddit_score"] = v["reddit_score"]
                if "hn_points" in v:
                    merged[vid]["hn_points"] = v["hn_points"]
            else:
                entry = dict(v)
                entry["sources"] = [entry.get("source", "unknown")]
                merged[vid] = entry

    return merged


# ── AI relevance check for English content ───────────────────

def is_ai_related_en(video_info: dict) -> bool:
    """Check AI relevance using English keywords (for Reddit/HN content)."""
    title = video_info.get("title", "").lower()
    description = video_info.get("description", "")[:300].lower()
    text = f"{title} {description}"
    return any(kw in text for kw in AI_KEYWORDS_EN)


# ── Main collection ──────────────────────────────────────────

def collect_scout(dry_run: bool = False) -> dict:
    """Run multi-source collection pipeline."""
    if not YOUTUBE_API_KEY:
        log.error("YOUTUBE_API_KEY not set")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    seen = load_seen_videos()
    seen = purge_stale(seen)

    # Phase 1: Collect from all sources
    log.info("=== Phase 1: Multi-source collection ===")

    rss_results = collect_rss(SUBSCRIBE_CHANNELS, SEARCH_CONFIG["lookback_hours"])
    yt_results = collect_youtube_keywords(YOUTUBE_API_KEY, KEYWORDS)
    reddit_results = collect_reddit(REDDIT_SUBREDDITS)
    hn_results = collect_hackernews()

    log.info("Raw totals: RSS=%d, YouTube=%d, Reddit=%d, HN=%d",
             len(rss_results), len(yt_results), len(reddit_results), len(hn_results))

    # Phase 2: Merge & deduplicate
    log.info("=== Phase 2: Merge & deduplicate ===")
    candidates = merge_candidates(rss_results, yt_results, reddit_results, hn_results)
    log.info("Unique candidates after merge: %d", len(candidates))

    if not candidates:
        log.info("No candidates found")
        if not dry_run:
            save_seen_videos(seen)
        return seen

    # Phase 3: Fetch YouTube metadata for new/unknown videos
    log.info("=== Phase 3: Fetch metadata ===")
    new_ids = [vid for vid in candidates if vid not in seen or not seen[vid].get("duration")]
    if new_ids:
        log.info("Fetching details for %d videos...", len(new_ids))
        try:
            details = youtube_get_video_details(YOUTUBE_API_KEY, new_ids)
            log.info("Got details for %d videos", len(details))
        except Exception as e:
            log.error("Details fetch failed: %s", e)
            details = {}
    else:
        details = {}

    # Phase 4: Fetch subscriber counts for channels
    log.info("=== Phase 4: Fetch channel subscriber counts ===")
    channel_ids = set()
    for vid, cand in candidates.items():
        ch_id = details.get(vid, {}).get("channel_id") or cand.get("channel_id")
        if ch_id:
            channel_ids.add(ch_id)
    if channel_ids:
        log.info("Fetching subscriber counts for %d channels...", len(channel_ids))
        try:
            channel_stats = youtube_get_channel_stats(YOUTUBE_API_KEY, list(channel_ids))
        except Exception as e:
            log.warning("Channel stats fetch failed: %s", e)
            channel_stats = {}
    else:
        channel_stats = {}

    # Phase 5: Update seen_videos
    log.info("=== Phase 5: Update seen_videos ===")
    now_iso = datetime.now(timezone.utc).isoformat()

    for vid, cand in candidates.items():
        det = details.get(vid, {})

        if vid in seen:
            # Update existing entry
            if det:
                seen[vid]["view_count"] = det.get("view_count", seen[vid].get("view_count", 0))
                seen[vid]["like_count"] = det.get("like_count", seen[vid].get("like_count", 0))
                if det.get("duration"):
                    seen[vid]["duration"] = det["duration"]
                ch_id = det.get("channel_id", "")
                if ch_id and ch_id in channel_stats:
                    seen[vid]["subscriber_count"] = channel_stats[ch_id]
            seen[vid]["last_checked"] = now_iso
            # Add multi-source info
            existing_sources = seen[vid].get("sources", [seen[vid].get("source", "unknown")])
            for s in cand.get("sources", []):
                if s not in existing_sources:
                    existing_sources.append(s)
            seen[vid]["sources"] = existing_sources
        else:
            # New entry
            ch_id = det.get("channel_id") or cand.get("channel_id", "")
            seen[vid] = {
                "title": cand.get("title", ""),
                "channel": cand.get("channel", ""),
                "description": cand.get("description", ""),
                "published_at": cand.get("published_at", ""),
                "first_seen": now_iso,
                "last_checked": now_iso,
                "view_count": det.get("view_count", 0),
                "like_count": det.get("like_count", 0),
                "duration": det.get("duration", ""),
                "source": cand.get("source", "unknown"),
                "sources": cand.get("sources", [cand.get("source", "unknown")]),
                "subscriber_count": channel_stats.get(ch_id, 0),
            }
            # Keep Reddit/HN metadata
            if "reddit_score" in cand:
                seen[vid]["reddit_score"] = cand["reddit_score"]
            if "hn_points" in cand:
                seen[vid]["hn_points"] = cand["hn_points"]

    if not dry_run:
        save_seen_videos(seen)

    total_new = len([v for v in candidates if v not in seen or seen[v].get("first_seen") == now_iso])
    log.info("Collection done: %d new, %d total tracked", total_new, len(seen))
    return seen


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-source YouTube AI video collector")
    parser.add_argument("--dry-run", action="store_true", help="Don't save results")
    args = parser.parse_args()

    try:
        collect_scout(dry_run=args.dry_run)
    except Exception as e:
        log.error("FATAL: %s", e)
        sys.exit(1)
