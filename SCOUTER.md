# Scouter - 아이디어 스카우터

> Secretary 안의 서브 프로젝트. yt-digest처럼 OpenClaw 잡으로 실행, Secretary에 저장, Telegram으로 배송.
> 목표: 커뮤니티에서 에이전틱 AI 아이디어를 자동으로 수집·랭킹·저장해 매주 나에게 배송.

---

## 아키텍처 개요

```
[OpenClaw Scouter Job] (주 1회, 월요일 오전)
       ↓
[스크래퍼] HN + IH + PH + lobste.rs + Substack + every.to + ...
       ↓
[Claude 분석기] 아이디어 추출 + 랭킹 (독창성/실행가능성/임팩트)
       ↓
[Secretary API] /api/scouter (Supabase scouter_ideas 테이블에 저장)
       ↓
[Telegram] 주간 Top 10 요약 전송
       ↓
[Secretary UI] /scouter 페이지 (전체 아이디어 브라우징)
```

---

## 스캔 대상 커뮤니티

### Tier 1 (매주 필수)
- **Hacker News**: `https://hn.algolia.com/api/v1/search` (Show HN, AI agent, personal automation)
- **Indie Hackers**: scrape `/posts` 필터 AI agent
- **Product Hunt**: `https://www.producthunt.com/` (AI 카테고리 신규 출시)
- **lobste.rs**: `https://lobste.rs/t/ai.json`

### Tier 2 (격주)
- **dev.to**: `https://dev.to/api/articles?tag=aiagents`
- **Substack**: every.to, latent.space, mindstream 최신 글
- **Reddit** (예외적으로 허용): r/LocalLLaMA, r/singularity 아이디어 스레드만

### Tier 3 (월 1회)
- **GitHub Trending**: AI agent 관련 레포
- **Mirror.xyz**: AI 에이전트 관련 글
- **LessWrong**: AI 개인 활용 포스트

---

## Secretary DB 스키마

```sql
-- Supabase SQL Editor에서 실행
CREATE TABLE scouter_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_platform TEXT NOT NULL,  -- 'hn', 'indiehackers', 'producthunt', etc.
  category TEXT,                   -- 'productivity', 'knowledge', 'health', etc.
  applicability TEXT,              -- 'openclaw', 'secretary', 'both', 'standalone'
  score_novelty INT,               -- 1-10
  score_feasibility INT,           -- 1-10
  score_impact INT,                -- 1-10
  score_total INT GENERATED ALWAYS AS (score_novelty + score_feasibility + score_impact) STORED,
  tags TEXT[],
  raw_content TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  week_label TEXT,                 -- '2026-W08' 형식
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  notes TEXT                       -- 내 메모
);

CREATE INDEX ON scouter_ideas(scraped_at DESC);
CREATE INDEX ON scouter_ideas(score_total DESC);
CREATE INDEX ON scouter_ideas(week_label);
CREATE INDEX ON scouter_ideas(is_starred);
```

---

## OpenClaw 스크립트 구조

```
~/.openclaw/scripts/scouter/
├── scouter.py          # 메인 오케스트레이터
├── scrapers/
│   ├── hn.py           # Hacker News Algolia API
│   ├── indiehackers.py # IH scraper
│   ├── producthunt.py  # PH API/scraper
│   ├── lobsters.py     # lobste.rs JSON API
│   ├── devto.py        # dev.to API
│   └── substack.py     # 특정 뉴스레터 RSS
├── analyzer.py         # Claude로 아이디어 추출+랭킹
├── storage.py          # Secretary API 호출
└── notifier.py         # Telegram 발송
```

### scouter.py 핵심 로직 (의사코드)

```python
import asyncio
from datetime import datetime

SECRETARY_API = "https://secretary-five.vercel.app/api/scouter"

async def run_scouter():
    week_label = datetime.now().strftime('%Y-W%W')

    # 1. 병렬 스크래핑
    raw_items = await asyncio.gather(
        scrape_hn(keywords=["AI agent", "personal automation", "agentic"]),
        scrape_indiehackers(tags=["ai-agents", "automation"]),
        scrape_producthunt(category="ai-agents"),
        scrape_lobsters(tag="ai"),
    )

    # 2. Claude로 분석 (배치)
    ideas = await analyze_with_claude(
        items=flatten(raw_items),
        system_prompt=ANALYZER_PROMPT,
        exclude=["social media automation", "youtube automation", "accounting"]
    )

    # 3. Secretary에 저장
    saved = await save_to_secretary(ideas, week_label)

    # 4. Telegram으로 Top 10 발송
    top10 = sorted(ideas, key=lambda x: x['score_total'], reverse=True)[:10]
    await send_telegram_digest(top10, week_label)

    return f"✅ Scouter 완료: {len(ideas)}개 아이디어 저장"
```

### analyzer.py 프롬프트 핵심

```python
ANALYZER_PROMPT = """
다음 커뮤니티 글들에서 에이전틱 AI 개인 활용 아이디어를 추출하라.

추출 기준:
- 실제 사람이 만들거나 쓰고 있는 것
- 개인/소규모 팀이 구현 가능한 것
- 유튜브 자동화, SNS 자동화, 회계 관련 제외

각 아이디어에 대해 JSON으로 반환:
{
  "title": "간결한 제목",
  "summary": "2-3문장 요약",
  "category": "productivity|knowledge|health|creative|home|financial|career|research|other",
  "applicability": "openclaw|secretary|both|standalone",
  "score_novelty": 1-10,     // 얼마나 독창적인가
  "score_feasibility": 1-10, // 지금 바로 구현 가능한가
  "score_impact": 1-10,      // 일상에 얼마나 임팩트가 있는가
  "tags": ["tag1", "tag2"],
  "why_interesting": "한 줄 설명"
}
"""
```

---

## Secretary API 엔드포인트

```typescript
// src/app/api/scouter/route.ts
// POST: 아이디어 저장 (OpenClaw에서 호출)
// GET: 아이디어 목록 조회 (UI에서 호출)

// src/app/api/scouter/[id]/route.ts
// PATCH: is_starred, is_read, notes 업데이트
```

---

## Secretary UI 페이지

```
/scouter 페이지 구성:
┌─────────────────────────────────────┐
│ 🔭 Scouter           [이번주] [전체] │
├─────────────────────────────────────┤
│ 필터: [전체] [미읽음] [★별표] [카테고리▾] │
│ 정렬: [점수순] [최신순]               │
├─────────────────────────────────────┤
│ ★ [총점 27] "아이디어 제목"           │
│    독창성:9 실행가능성:9 임팩트:9      │
│    summary 텍스트...                  │
│    [secretary] #productivity  [출처↗] │
├─────────────────────────────────────┤
│ ★ [총점 25] "아이디어 제목 2"         │
│    ...                               │
└─────────────────────────────────────┘
```

---

## OpenClaw 설정 (openclaw.json 추가)

```json
{
  "jobs": {
    "scouter": {
      "script": "scripts/scouter/scouter.py",
      "schedule": "0 7 * * MON",
      "description": "Weekly idea scouting from tech communities",
      "telegram_notify": true
    }
  }
}
```

---

## 구현 순서 (Phase별)

### Phase 1: 기반 구조 (2-3시간)
- [ ] Supabase `scouter_ideas` 테이블 생성
- [ ] Secretary `/api/scouter` POST/GET 엔드포인트
- [ ] OpenClaw `scripts/scouter/` 기본 구조

### Phase 2: 스크래퍼 + 분석기 (3-4시간)
- [ ] HN Algolia API 스크래퍼 (가장 쉬움, JSON API)
- [ ] Claude 분석기 (랭킹 + 카테고리)
- [ ] Secretary 저장 + Telegram 발송

### Phase 3: UI (2-3시간)
- [ ] `/scouter` 페이지 (목록 + 필터 + 정렬)
- [ ] 별표/읽음 표시 + 메모 기능
- [ ] 커맨드 팔레트에 "scouter 열기" 추가

### Phase 4: 스크래퍼 확장
- [ ] Indie Hackers, Product Hunt, lobste.rs 추가
- [ ] dev.to, Substack RSS 추가
- [ ] 중복 제거 로직 (URL + 의미 유사도)

---

## 향후 확장 아이디어

1. **자동 구현 파이프라인**: 별표 아이디어 → "이거 만들어줘" → Secretary에 새 태스크 자동 생성
2. **트렌드 감지**: 같은 아이디어가 여러 커뮤니티에 동시 등장 시 "핫 트렌드" 알림
3. **개인화 학습**: 내가 별표 누른 아이디어 패턴 학습 → 랭킹 알고리즘 조정
4. **아이디어 클러스터링**: 유사 아이디어 묶어서 "이번 주 트렌드 테마" 생성
5. **구현 난이도 자동 평가**: 내 현재 스택(Secretary + OpenClaw)으로 구현 시간 추정

---

## 참고 - 이미 발굴된 아이디어 초기 시드

초기 시드 데이터는 `ideas-seed.md` 파일 참조 (에이전트 탐색 결과 200+ 개 저장 예정)

---

*작성: 2026-02-21*
*상태: 계획 단계*
