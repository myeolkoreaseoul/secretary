# Codex Prompt — 다이제스트 3: 100만 조회수 다이제스트 (digest_million.py)

## 목표
최근 업로드된 영상 중 조회수 100만을 돌파한 영상만 모아서 텔레그램으로 전송하는 스크립트를 만들어라.

## 확정 스펙

- 대상: 5개국 — KR, US, JP, TW, SG
- 수집: YouTube Data API v3 `videos.list?chart=mostPopular` (국가당 50개)
- 필터: 조회수 1,000,000 이상만
- 추가 필터: publishedAt 기준 최근 72시간 이내 (오래된 영상 제외)
- 카테고리: 전체 (필터 없음)
- 채널 크기: 불문 (대형이든 소형이든 100만이면 포함)
- 전송: 텔레그램 봇 (HTML parse_mode)
- 저장: Supabase DB digests 테이블 (mode="million") + JSON 히스토리
- 실행: systemd timer

## 작업 디렉토리

`/home/john/projects/secretary/`

## 생성할 파일

```
scripts/digest_million.py     ← 메인 스크립트
```

## 기존 코드 참고 (읽기 전용)

### 환경변수 로드 패턴 (bot/config.py)
```python
# 이 파일에서 import해서 사용
from bot.config import (
    YOUTUBE_API_KEY,
    SUPABASE_REST_URL,
    SUPABASE_HEADERS,
    TELEGRAM_ALLOWED_USERS,  # [8280174296]
)
from bot import telegram_sender as tg
```

### 텔레그램 전송 패턴 (bot/telegram_sender.py)
```python
# async 함수. 4096자 자동분할, Markdown 모드
await tg.send_message(chat_id, text)
```

### 조회수 포맷 패턴 (scripts/digest_trending.py 참고)
```python
def fmt_views(n):
    if n >= 100_000_000: return f"{n // 100_000_000}억"
    if n >= 10_000: return f"{n / 10_000:.1f}만"
    if n >= 1_000: return f"{n / 1_000:.1f}천"
    return str(n)
```

### DB 저장 패턴 (scripts/digest_trending.py 참고)
```python
import httpx
# digests 테이블에 upsert (digest_date + mode 기준)
# mode="million" 사용
async with httpx.AsyncClient() as client:
    resp = await client.post(
        f"{SUPABASE_REST_URL}/digests",
        headers=SUPABASE_HEADERS,
        json={
            "digest_date": date_str,
            "mode": "million",
            "videos": db_videos,  # JSONB
            "header": "100만+ 조회수 다이제스트",
            "video_count": len(db_videos),
        },
    )
```

**중요**: digests 테이블의 mode 컬럼에 CHECK 제약이 있을 수 있다. 만약 INSERT 실패하면 다음 SQL로 제약 변경:
```sql
ALTER TABLE digests DROP CONSTRAINT IF EXISTS digests_mode_check;
ALTER TABLE digests ADD CONSTRAINT digests_mode_check CHECK (mode IN ('morning', 'evening', 'trending', 'million', 'viral'));
```

## digest_million.py 구현 요구사항

```python
"""100만+ 조회수 유튜브 다이제스트.

YouTube mostPopular API로 5개국 인기 영상 중 100만 이상만 필터링하여 전송.

Usage:
  python3 -m scripts.digest_million               # normal
  python3 -m scripts.digest_million --dry-run      # no DB, no Telegram
"""

import argparse
import asyncio
import logging
import re
import sys
import json
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
log = logging.getLogger("digest_million")

KST = timezone(timedelta(hours=9))

# ── Configuration ─────────────────────────────────────────────

REGIONS = [
    {"code": "KR", "name": "한국", "flag": "🇰🇷"},
    {"code": "US", "name": "미국", "flag": "🇺🇸"},
    {"code": "JP", "name": "일본", "flag": "🇯🇵"},
    {"code": "TW", "name": "대만", "flag": "🇹🇼"},
    {"code": "SG", "name": "싱가포르", "flag": "🇸🇬"},
]

MIN_VIEWS = 1_000_000       # 100만
MAX_AGE_HOURS = 72          # 최근 72시간 이내 업로드만
MAX_RESULTS = 50            # API 최대값

CATEGORY_MAP = {
    "1": "영화/애니", "2": "자동차", "10": "음악",
    "15": "동물", "17": "스포츠", "18": "단편영화",
    "19": "여행", "20": "게임", "21": "블로그",
    "22": "인물/블로그", "23": "코미디", "24": "엔터",
    "25": "뉴스/정치", "26": "스타일", "27": "교육",
    "28": "과학/기술", "29": "사회운동",
}

DATA_DIR = Path(__file__).parent.parent / "data" / "million"

# ── YouTube API ───────────────────────────────────────────────

# http_get_json(url, retries=3) — urllib 사용, retry 포함
# fetch_trending(region_code) → mostPopular API → list[dict]
#   각 영상: video_id, title, channel, category, views, likes,
#           duration, published_at, url
# filter_million(videos) → 100만+ & 72시간 이내만

# ── Format ────────────────────────────────────────────────────

# fmt_views(n) → "1.2만", "345만", "1.2억" 한국식 축약
# format_duration(iso) → "12분 34초" 형식

def format_telegram_message(date_str, all_results):
    """
    포맷 예시:

    💎 100만+ 조회수 다이제스트 (2026-02-25)

    🇰🇷 한국 (8개)
    1. [음악] IVE 'BLACKHOLE' MV — starshipTV
       · 조회 2,345만 · ⏱ 3분 42초
       · 🔗 https://youtu.be/xxx

    2. [엔터] 런닝맨 EP700 — SBS
       · 조회 456만 · ⏱ 1시간 12분
       · 🔗 https://youtu.be/yyy

    🇺🇸 미국 (12개)
    ...

    ────────────────
    📊 총 37개 영상 | 최고 조회: 4,567만 (IVE 'BLACKHOLE')
    📂 카테고리: 음악(15) · 엔터(8) · 게임(6) · 스포츠(5) · 기타(3)
    """
    # 국가별로 조회수 내림차순 정렬
    # 국가별 영상 수 헤더에 표시
    # 마지막에 총계 + 카테고리 분포 + 최고 조회수 표시

# ── Save ──────────────────────────────────────────────────────

# save_to_db(date_str, videos) — Supabase digests 테이블 upsert (mode="million")
# save_history(all_results) — data/million/million_YYYY-MM-DD.json

# ── Main ──────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")

    # 1. 5개국 수집
    all_results = {}
    total_million = 0
    for region in REGIONS:
        videos = fetch_trending(region["code"])
        million_videos = filter_million(videos)
        all_results[region["code"]] = {
            "region": region,
            "videos": million_videos,
        }
        total_million += len(million_videos)

    # 2. 포맷
    text = format_telegram_message(date_str, all_results)

    if args.dry_run:
        print(text)
        print(f"\nTotal: {total_million} videos with 1M+ views")
        return

    # 3. DB 저장
    # 모든 국가의 million 영상을 합쳐서 DB에 저장

    # 4. JSON 히스토리 저장

    # 5. 텔레그램 전송
    for chat_id in TELEGRAM_ALLOWED_USERS:
        await tg.send_message(chat_id, text)

if __name__ == "__main__":
    asyncio.run(main())
```

## API 쿼터
- videos.list(mostPopular) × 5개국 = 5 units
- 일일 한도 10,000 중 0.05%. 무시할 수준.

## systemd timer/service

### ~/.config/systemd/user/secretary-million.timer
```ini
[Unit]
Description=Secretary 100M+ Views Digest Timer

[Timer]
OnCalendar=*-*-* 11:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

### ~/.config/systemd/user/secretary-million.service
```ini
[Unit]
Description=Secretary 100M+ Views Digest
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/home/john/projects/secretary
ExecStart=/usr/bin/python3 -m scripts.digest_million
StandardOutput=journal
StandardError=journal
SyslogIdentifier=secretary-million
NoNewPrivileges=yes
Environment=PATH=/home/john/.local/bin:/usr/local/bin:/usr/bin:/bin
TimeoutStartSec=120

[Install]
WantedBy=default.target
```

타이머 활성화:
```bash
systemctl --user daemon-reload
systemctl --user enable --now secretary-million.timer
```

## 제약사항

- 외부 라이브러리: httpx만 추가 (pip install httpx). urllib은 표준라이브러리.
- digest_trending.py의 패턴을 따르되, 100만 필터가 핵심 차이점
- 영상이 0개여도 "오늘은 100만+ 영상이 없습니다" 메시지 전송
- 에러 시 해당 국가 skip, 나머지 계속

## 테스트

작성 완료 후 반드시 테스트:
```bash
cd /home/john/projects/secretary
python3 -m scripts.digest_million --dry-run
```

확인 항목:
1. 5개국 API 호출 성공
2. 100만+ 필터 정상 작동
3. 0개인 국가도 에러 없이 처리
4. 텔레그램 메시지 포맷 정상 (4096자 분할 포함)
5. JSON 저장 정상
