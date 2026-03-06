"""Signal-based video scoring engine for Scout System.

Scores videos using:
  - Viral ratio: log10(views) / log10(subscribers)
  - Velocity: views per hour since upload
  - Engagement: (likes + comments) / views
  - Source bonus: multi-source discovery bonus

Usage:
  Called by digest_youtube.py, not run directly.
"""

import html as html_mod
import logging
import math
import re
from datetime import datetime, timezone, timedelta

log = logging.getLogger("score_videos")


def _viral_ratio(views: int, subs: int) -> float:
    """Log-scale viral ratio. Higher = more viral relative to channel size."""
    return math.log10(views + 1) / math.log10(max(subs, 50))


def _velocity(views: int, published_at: str) -> float:
    """Views per hour since upload."""
    if not published_at:
        return 0.0
    try:
        pub_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        hours = max((datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600, 1)
        return views / hours
    except (ValueError, TypeError):
        return 0.0


def _engagement(likes: int, views: int) -> float:
    """Engagement ratio."""
    if views < 1:
        return 0.0
    return likes / views


def _source_bonus(sources: list[str]) -> float:
    """Bonus for multi-source discovery."""
    if len(sources) >= 2:
        return 0.20
    if "reddit" in sources:
        return 0.15
    if "hackernews" in sources:
        return 0.10
    return 0.0


def _normalize_batch(values: list[float]) -> list[float]:
    """Min-max normalize a list of values to 0-1."""
    if not values:
        return values
    max_val = max(values)
    min_val = min(values)
    if max_val == min_val:
        return [0.5] * len(values)
    return [(v - min_val) / (max_val - min_val) for v in values]


def score_and_filter(
    seen: dict,
    mode: str,
    min_score: float = 0.15,
    max_per_channel: int = 4,
) -> list[dict]:
    """Score and filter videos for digest.

    Args:
        seen: seen_videos dict from collect_scout
        mode: "morning" (48h window) or "evening" (24h window)
        min_score: minimum score threshold (default 0.3)
        max_per_channel: max videos per channel (default 2)

    Returns:
        Sorted list of video dicts with scores, filtered and ready for digest.
    """
    from scripts.collect_youtube import (
        is_ai_related,
        is_korean_title,
        is_shorts,
        parse_iso_duration,
        BLOCKED_CHANNELS,
        BLOCKED_TITLE_KEYWORDS,
    )
    from scripts.collect_scout import is_ai_related_en

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=48)  # 항상 48시간 윈도우

    # Phase 1: Collect candidates within time window
    candidates = []
    for vid, info in seen.items():
        # Time window filter
        first_seen = info.get("first_seen", "")
        if first_seen:
            try:
                fs_dt = datetime.fromisoformat(first_seen.replace("Z", "+00:00"))
                if fs_dt < window_start:
                    continue
            except (ValueError, TypeError):
                pass

        title = html_mod.unescape(info.get("title", ""))
        sources = info.get("sources", [info.get("source", "unknown")])
        is_external = any(s in ("reddit", "hackernews") for s in sources)

        # AI relevance check
        if not is_ai_related(info):
            if is_external and is_ai_related_en(info):
                pass  # External + English AI = OK
            else:
                continue

        # Korean title check (skip for external sources)
        if not is_external:
            if not is_korean_title(title):
                continue

        # Duration filter
        dur_sec = parse_iso_duration(info.get("duration", ""))
        if dur_sec > 0:
            if dur_sec < 61 or dur_sec > 5400:
                continue

        # Shorts filter
        if is_shorts(info):
            continue

        # Blocked channels
        channel = info.get("channel", "")
        blocked = False
        for b in BLOCKED_CHANNELS:
            if b in channel:
                blocked = True
                break
        if blocked:
            continue

        # Blocked title keywords
        title_lower = title.lower()
        blocked_kw = False
        for bkw in BLOCKED_TITLE_KEYWORDS:
            if bkw.lower() in title_lower:
                blocked_kw = True
                break
        if blocked_kw:
            continue

        views = info.get("view_count", 0)
        likes = info.get("like_count", 0)
        subs = info.get("subscriber_count", 0)
        published = info.get("published_at", "")

        candidates.append({
            "video_id": vid,
            "title": title,
            "channel": html_mod.unescape(channel),
            "view_count": views,
            "like_count": likes,
            "subscriber_count": subs,
            "duration": info.get("duration", ""),
            "published_at": published,
            "description": info.get("description", ""),
            "sources": sources,
            "reddit_score": info.get("reddit_score", 0),
            "hn_points": info.get("hn_points", 0),
            "_viral": _viral_ratio(views, subs),
            "_velocity": _velocity(views, published),
            "_engagement": _engagement(likes, views),
            "_source_bonus": _source_bonus(sources),
        })

    if not candidates:
        log.info("No candidates after filtering")
        return []

    log.info("Candidates after basic filters: %d", len(candidates))

    # Phase 2: Normalize velocity (batch-level)
    velocities = [c["_velocity"] for c in candidates]
    norm_velocities = _normalize_batch(velocities)
    for i, c in enumerate(candidates):
        c["_velocity_norm"] = norm_velocities[i]

    # Phase 3: Calculate final score
    for c in candidates:
        score = (
            c["_viral"] * 0.35
            + c["_velocity_norm"] * 0.25
            + c["_engagement"] * 0.15
            + c["_source_bonus"] * 0.25
        )
        c["score"] = round(score, 4)

    # Phase 4: Filter by minimum score
    # For videos with no details (view_count=0), give them a pass if from external source
    scored = []
    for c in candidates:
        if c["view_count"] == 0 and any(s in ("reddit", "hackernews") for s in c["sources"]):
            # External source with no YouTube details yet — include with base score
            c["score"] = max(c["score"], 0.3)
            scored.append(c)
        elif c["score"] >= min_score:
            scored.append(c)
        elif c["view_count"] == 0 and not c.get("duration"):
            # Details never fetched (API quota) — include anyway
            c["score"] = max(c["score"], 0.3)
            scored.append(c)

    log.info("After score filter (>= %.2f): %d videos", min_score, len(scored))

    # Phase 5: Sort by score descending
    scored.sort(key=lambda v: v["score"], reverse=True)

    # Phase 6: Apply per-channel limit
    channel_count = {}
    final = []
    for v in scored:
        ch = v["channel"] or "unknown"
        channel_count[ch] = channel_count.get(ch, 0) + 1
        if channel_count[ch] > max_per_channel:
            continue
        final.append(v)

    log.info("Final after channel limit (%d/ch): %d videos", max_per_channel, len(final))

    return final
