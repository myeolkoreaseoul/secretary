# Codex Prompt — 다이제스트 4: 히든 유망주 다이제스트 (digest_viral.py)

## 목표
채널 규모에 비해 비정상적으로 터진 영상("히든 유망주")을 자동 발굴하여 텔레그램으로 전송하는 스크립트를 만들어라.
주제 무관. 5개국 대상. YouTube + Reddit 크로스소스.

## 핵심 아이디어
구독자 5천 채널에서 조회수 50만 나오면 = 유망주.
구독자 500만 채널에서 조회수 50만 나오면 = 평범.
수치로만 판단. 주제/카테고리 필터 없음.

## 확정 스펙

- 주제: 전 주제 (AI 한정 아님)
- 대상: 5개국 — KR, US, JP, TW, SG
- 소스 A: YouTube search API — 카테고리별 최근 24h 영상 (viewCount 정렬)
- 소스 B: Reddit — 범용 서브레딧 9개에서 유튜브 링크 추출
- 판별 공식: `viral_ratio = log10(조회수 + 1) / log10(구독자수 + 1)`
- 필터: 구독자 50만↓, 조회수 1만↑, viral ratio 2.0↑, 길이 1분~90분, 채널당 1개
- 정렬: viral ratio 내림차순
- 출력: 30개 이상 목표
- 전송: 텔레그램 봇 (HTML parse_mode)
- 저장: Supabase DB (mode="viral") + JSON 히스토리
- 실행: systemd timer

## 작업 디렉토리

`/home/john/projects/secretary/`

## 생성할 파일

```
scripts/digest_viral.py       ← 메인 스크립트
data/viral/                   ← 데이터 디렉토리 (자동 생성)
  viral_seen.json             ← 중복 방지 (video_id 기록, 7일 보관)
  channel_cache.json          ← 구독자수 캐시 (24h TTL)
  viral_YYYY-MM-DD.json       ← 일별 결과 히스토리
```

## 기존 코드 참고 (읽기 전용)

### 환경변수 로드 (bot/config.py)
```python
from bot.config import (
    YOUTUBE_API_KEY,
    SUPABASE_REST_URL,
    SUPABASE_HEADERS,
    TELEGRAM_ALLOWED_USERS,  # [8280174296]
)
from bot import telegram_sender as tg
```

### 스코어링 로직 참고 (scripts/score_videos.py)
```python
import math

def viral_ratio(views, subs):
    return math.log10(views + 1) / math.log10(max(subs, 50))

def velocity(views, published_at):
    hours = max(hours_since_upload, 1)
    return views / hours

def engagement(likes, views):
    return likes / max(views, 1)

def source_bonus(sources):
    if len(sources) >= 2: return 0.20
    if "reddit" in sources: return 0.15
    return 0.0
```

### Reddit 수집 참고 (scripts/collect_scout.py)
```python
REDDIT_UA = "secretary-scout/1.0 by Illustrious-Half-129"
# URL: https://www.reddit.com/r/{sub}/hot.json?limit=50
# YouTube video_id 추출: r'(?:v=|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})'
# 요청 간 2초 sleep (Reddit rate limit)
```

### 텔레그램 전송 (bot/telegram_sender.py)
```python
# async 함수. 4096자 자동분할
await tg.send_message(chat_id, text)
```

### DB 저장 패턴
```python
# digests 테이블 upsert (mode="viral")
# 동일 패턴: digest_trending.py의 save_digest() 참고
```

**중요**: digests 테이블의 mode CHECK 제약에 "viral" 추가 필요할 수 있음:
```sql
ALTER TABLE digests DROP CONSTRAINT IF EXISTS digests_mode_check;
ALTER TABLE digests ADD CONSTRAINT digests_mode_check CHECK (mode IN ('morning', 'evening', 'trending', 'million', 'viral'));
```

## digest_viral.py 구현 요구사항

```python
"""히든 유망주 유튜브 다이제스트.

채널 규모 대비 비정상적으로 터진 영상을 자동 발굴.
YouTube search API (카테고리별) + Reddit (범용 서브레딧) 크로스소스.

Usage:
  python3 -m scripts.digest_viral               # normal
  python3 -m scripts.digest_viral --dry-run      # no DB, no Telegram
"""

import argparse
import asyncio
import json
import logging
import math
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("digest_viral")

KST = timezone(timedelta(hours=9))

# ── Configuration ─────────────────────────────────────────────

SEARCH_REGIONS = [
    {"code": "KR", "lang": "ko", "name": "한국", "flag": "🇰🇷"},
    {"code": "US", "lang": "en", "name": "미국", "flag": "🇺🇸"},
    {"code": "JP", "lang": "ja", "name": "일본", "flag": "🇯🇵"},
    {"code": "TW", "lang": "zh-TW", "name": "대만", "flag": "🇹🇼"},
    {"code": "SG", "lang": "en", "name": "싱가포르", "flag": "🇸🇬"},
]

YOUTUBE_CATEGORIES = [
    {"id": "10", "name": "음악"},
    {"id": "17", "name": "스포츠"},
    {"id": "20", "name": "게임"},
    {"id": "22", "name": "블로그"},
    {"id": "23", "name": "코미디"},
    {"id": "24", "name": "엔터"},
    {"id": "25", "name": "뉴스"},
    {"id": "26", "name": "스타일"},
    {"id": "27", "name": "교육"},
    {"id": "28", "name": "과학기술"},
]

# Reddit 범용 서브레딧 (AI 한정 아님!)
REDDIT_SUBS = [
    "videos",
    "mealtimevideos",
    "Documentaries",
    "InternetIsBeautiful",
    "nextfuckinglevel",
    "todayilearned",
    "technology",
    "science",
    "worldnews",
]
REDDIT_UA = "secretary-viral/1.0 by Illustrious-Half-129"
YT_REGEX = re.compile(r'(?:v=|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})')

# 필터 기준
MAX_SUBSCRIBERS = 500_000     # 50만 이하만
MIN_VIEWS = 10_000            # 1만 이상만
MIN_VIRAL_RATIO = 2.0         # viral ratio 2.0 이상
MIN_DURATION_SEC = 60         # 1분 이상
MAX_DURATION_SEC = 5400       # 90분 이하
MAX_PER_CHANNEL = 1           # 채널당 1개

DATA_DIR = Path(__file__).parent.parent / "data" / "viral"

# ── 소스 A: YouTube 카테고리별 검색 ──────────────────

def collect_youtube_candidates(region: dict) -> list[dict]:
    """YouTube search API로 카테고리별 최근 24h 영상 수집.

    전략:
    - 각 카테고리별 search.list(order=viewCount, publishedAfter=24h전)
    - 카테고리당 최대 10개 × 10 카테고리 = 100개/국가
    - API 쿼터: search.list = 100 units/call
    - 10 카테고리 × 5 국가 = 50 calls = 5,000 units

    반환: list[dict] — 각 dict에 video_id, title, channel_id, channel_title, category, source="youtube", region 포함
    """
    # publishedAfter = (now_utc - 24h).isoformat() + "Z"
    # 각 카테고리별 search.list 호출
    # videoCategoryId 파라미터로 카테고리 필터
    # order=viewCount, type=video, maxResults=10
    # 요청 간 0.5초 sleep
    # API 에러 시 해당 카테고리 skip (나머지 계속)

# ── 소스 B: Reddit 유튜브 링크 추출 ──────────────────

def collect_reddit_candidates() -> list[dict]:
    """Reddit 핫 포스트에서 유튜브 링크 추출.

    - 각 서브레딧의 /hot.json에서 상위 50개 포스트 확인
    - URL에 youtube/youtu.be 포함된 것만 추출
    - video_id 파싱
    - 요청 간 2초 sleep (Reddit rate limit)
    - 429 에러 시 해당 서브레딧 skip

    반환: list[dict] — 각 dict에 video_id, reddit_sub, reddit_score, source="reddit" 포함
    """

# ── 후보 병합 ────────────────────────────────────────

def merge_candidates(yt_candidates: list, reddit_candidates: list) -> dict:
    """video_id 기준으로 병합. 중복 시 sources 리스트 합침.

    반환: dict[video_id] → {video_id, sources: ["youtube", "reddit"], reddit_score, category, region, ...}
    """

# ── 메타데이터 조회 ──────────────────────────────────

def enrich_with_metadata(candidates: dict) -> list[dict]:
    """YouTube videos.list + channels.list로 상세 정보 조회.

    - videos.list: view_count, like_count, comment_count, duration, published_at (50개씩 배치)
    - channels.list: subscriber_count (channel_cache.json으로 24h 캐시)
    - 50개씩 배치 조회 (API 최대)

    반환: list[dict] — 기존 정보에 views, likes, comments, subscribers, duration_sec 추가
    """

def load_channel_cache() -> dict:
    """channel_cache.json 로드. 24시간 지난 항목 삭제."""

def save_channel_cache(cache: dict):
    """channel_cache.json 저장."""

# ── 스코어링 + 필터링 ────────────────────────────────

def calculate_viral_ratio(views: int, subs: int) -> float:
    """viral_ratio = log10(views + 1) / log10(max(subs, 50))"""
    return math.log10(views + 1) / math.log10(max(subs, 50))

def score_video(video: dict) -> float:
    """종합 스코어 계산.

    viral = viral_ratio 정규화
    velocity = views / hours_since_upload 정규화
    engagement = likes / views
    source_bonus = reddit 0.15, 복수소스 0.20

    final = viral*0.40 + velocity_norm*0.25 + engagement*0.10 + source_bonus*0.25
    """

def filter_viral(videos: list[dict]) -> list[dict]:
    """히든 유망주 필터.

    조건:
    1. subscribers <= 500,000
    2. views >= 10,000
    3. viral_ratio >= 2.0
    4. duration: 60초~5400초
    5. 채널당 최대 1개 (가장 높은 viral ratio 유지)

    정렬: viral_ratio 내림차순
    """

# ── 중복 방지 ────────────────────────────────────────

def load_seen() -> dict:
    """viral_seen.json 로드. {video_id: timestamp}. 7일 지난 항목 삭제."""

def save_seen(seen: dict):
    """viral_seen.json 저장."""

# ── 텔레그램 포맷 ────────────────────────────────────

def fmt_views(n: int) -> str:
    """한국식 축약: 1.2만, 345만, 1.2억"""

def fmt_subs(n: int) -> str:
    """구독자 축약: 2.3만, 8천"""

def format_telegram_message(date_str: str, videos: list[dict]) -> str:
    """
    포맷 예시:

    🔥 히든 유망주 다이제스트 (2026-02-25)

    🇺🇸 미국
    1. [과학기술] 양자컴퓨터로 단백질 접기 — QuantumLab (구독 2.3만)
       · 조회 87만 · viral ×37.8 · ⏱ 12분
       · 🔗 https://youtu.be/xxx
       · 📡 Reddit r/science (↑2.4k)

    2. [교육] 30일 만에 중국어 마스터 — PolyglotSteve (구독 8천)
       · 조회 42만 · viral ×52.5 · ⏱ 18분
       · 🔗 https://youtu.be/yyy

    🇰🇷 한국
    1. [요리] 시골 할머니의 된장찌개 — 시골밥상 (구독 1.2만)
       · 조회 156만 · viral ×130 · ⏱ 8분
       · 🔗 https://youtu.be/zzz

    🇯🇵 일본
    ...

    ────────────────
    🏆 오늘의 최고 유망주: "양자컴퓨터로 단백질 접기" (viral ×37.8)
    📊 총 42개 발견 | YouTube 35개 + Reddit 7개
    💡 복수 소스 발견: 5개 (YouTube + Reddit 동시 탐지)
    """
    # 국가별로 그룹핑 (region 기준)
    # 각 영상: 순위, [카테고리] 제목 — 채널명 (구독 N만)
    #          조회수, viral 배수(×N.N), 시간
    #          링크
    #          Reddit 출처 있으면 표시
    # 마지막에 통계 요약

# ── DB 저장 ──────────────────────────────────────────

async def save_to_db(date_str: str, videos: list[dict]):
    """Supabase digests 테이블에 upsert (mode="viral")."""

def save_history(videos: list[dict]):
    """data/viral/viral_YYYY-MM-DD.json에 저장."""

# ── Main ──────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")

    log.info("Starting viral digest for %s", date_str)

    # 1. YouTube 카테고리별 수집 (5개국)
    yt_candidates = []
    for region in SEARCH_REGIONS:
        candidates = collect_youtube_candidates(region)
        yt_candidates.extend(candidates)
        log.info("YouTube %s: %d candidates", region["code"], len(candidates))

    # 2. Reddit 수집
    reddit_candidates = collect_reddit_candidates()
    log.info("Reddit: %d candidates", len(reddit_candidates))

    # 3. 병합 + 중복 제거
    merged = merge_candidates(yt_candidates, reddit_candidates)
    log.info("Merged: %d unique candidates", len(merged))

    # 4. seen 필터 (이미 보낸 것 제외)
    seen = load_seen()
    new_candidates = {vid: info for vid, info in merged.items() if vid not in seen}
    log.info("New candidates (after seen filter): %d", len(new_candidates))

    # 5. 메타데이터 조회
    enriched = enrich_with_metadata(new_candidates)
    log.info("Enriched: %d videos with metadata", len(enriched))

    # 6. 스코어링 + 필터링
    viral_videos = filter_viral(enriched)
    log.info("Viral filter passed: %d videos", len(viral_videos))

    # 7. 포맷
    text = format_telegram_message(date_str, viral_videos)

    if args.dry_run:
        print(text)
        print(f"\nTotal: {len(viral_videos)} viral videos")
        return

    # 8. DB 저장
    await save_to_db(date_str, viral_videos)

    # 9. 텔레그램 전송
    for chat_id in TELEGRAM_ALLOWED_USERS:
        await tg.send_message(chat_id, text)

    # 10. seen 업데이트
    now_iso = datetime.now(timezone.utc).isoformat()
    for v in viral_videos:
        seen[v["video_id"]] = now_iso
    save_seen(seen)

    # 11. 히스토리 저장
    save_history(viral_videos)

    log.info("Viral digest complete: %d videos sent", len(viral_videos))

if __name__ == "__main__":
    asyncio.run(main())
```

## API 쿼터 계산

| 호출 | units/call | 횟수 | 소계 |
|------|-----------|------|------|
| search.list (10카테고리 × 5국가) | 100 | 50 | 5,000 |
| videos.list (메타데이터, 50개씩) | 1 | ~10 | 10 |
| channels.list (구독자, 50개씩) | 1 | ~10 | 10 |
| **합계** | | | **~5,020** |

4개 다이제스트 합산:
- AI(07:00): ~1,050
- Trending(09:00): 5
- 100만(11:00): 5
- 유망주(20:00): ~5,020
- **합계: ~6,080 / 10,000** ← 여유 있음

## systemd timer/service

### ~/.config/systemd/user/secretary-viral.timer
```ini
[Unit]
Description=Secretary Viral Discovery Digest Timer

[Timer]
OnCalendar=*-*-* 20:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### ~/.config/systemd/user/secretary-viral.service
```ini
[Unit]
Description=Secretary Viral Discovery Digest
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/home/john/projects/secretary
ExecStart=/usr/bin/python3 -m scripts.digest_viral
StandardOutput=journal
StandardError=journal
SyslogIdentifier=secretary-viral
NoNewPrivileges=yes
Environment=PATH=/home/john/.local/bin:/usr/local/bin:/usr/bin:/bin
TimeoutStartSec=600

[Install]
WantedBy=default.target
```

타이머 활성화:
```bash
systemctl --user daemon-reload
systemctl --user enable --now secretary-viral.timer
```

## 제약사항

- 외부 라이브러리: httpx만 (pip install httpx). 나머지 표준라이브러리.
- Reddit은 인증 없이 JSON API 사용 (User-Agent 필수)
- Reddit 429 에러 시: 해당 서브레딧 skip, 나머지 계속
- YouTube API 에러 시: 해당 카테고리/국가 skip, 나머지 계속
- 조회수: "1.2만", "345만" 한국식 축약
- viral ratio: "×37.8" 형식
- 영상 0개여도 "오늘은 기준 충족 영상이 없습니다" 메시지 전송
- channel_cache.json: 24시간 TTL. 캐시 히트 시 API 호출 안 함 (쿼터 절약)
- viral_seen.json: 7일 보관 후 자동 삭제

## 테스트

작성 완료 후 반드시 테스트:
```bash
cd /home/john/projects/secretary
python3 -m scripts.digest_viral --dry-run
```

확인 항목:
1. YouTube 카테고리별 수집 성공 (최소 3개국 × 5카테고리 이상)
2. Reddit 수집 성공 (최소 3개 서브레딧 이상, 429 에러 graceful skip)
3. 메타데이터 조회 성공 (videos.list + channels.list)
4. channel_cache.json 생성 확인
5. viral ratio 계산 정확성 (수동 검증: log10(views+1)/log10(subs+1))
6. 필터 결과 확인 (0개여도 정상)
7. 텔레그램 메시지 포맷 확인 (viral ×N.N 표시, 국가별 그룹핑)
8. viral_seen.json 생성 확인
9. JSON 히스토리 저장 확인

## 중요: 이것은 AI 전용이 아님
기존 AI 다이제스트(다이제스트 1)와 완전히 별개.
주제를 가리지 않는 범용 바이럴 탐지기.
키워드 필터 없음. 오직 수치(viral ratio, velocity, engagement)로만 판단.
