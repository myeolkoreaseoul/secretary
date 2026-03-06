# Secretary Daily Planner V2 - 아키텍처 설계

> 작성일: 2026-03-02
> 한줄 요약: 텔레그램에 자연어로 할 일을 말하면 AI가 시간표를 짜주고,
> 컴퓨터가 뭘 하는지 자동 기록해서 하루 끝에 계획 vs 실제를 비교해줌.

---

## 1. 쉬운 설명

### 하루의 흐름

```
아침 8:30                     낮 (자동)                    밤 22:00
┌──────────────┐           ┌──────────────┐           ┌──────────────┐
│  📱 텔레그램   │           │  🖥️ 컴퓨터 감시 │           │  📊 하루 리뷰  │
│              │           │              │           │              │
│ "오늘 보고서   │           │ 1분마다 자동   │           │ 계획 vs 실제  │
│  마감, 3시    │           │ 뭐 하는지 기록 │           │ 비교해서      │
│  회의"        │           │              │           │ 텔레그램 발송  │
│      ↓       │           │ Excel 45분    │           │              │
│ AI가 시간표   │           │ Chrome 30분   │           │ "달성률 75%"  │
│ 짜서 보여줌   │           │ YouTube 15분  │           │ "유튜브 1시간" │
└──────────────┘           └──────────────┘           └──────────────┘
```

### 사용자가 할 일 = 딱 2개

1. 아침에 텔레그램으로 오늘 할 거 자연어로 보내기
2. 오프라인 활동만 간단히 기록 (팀버핏 갔다옴 등)

나머지는 전부 자동.

---

## 2. 현재 상태 진단

### 있는 것 vs 작동 여부

| 구성요소 | 코드 존재 | 실제 작동 | 문제점 |
|---------|----------|----------|--------|
| `activity_tracker.ps1` | ✅ | ❌ | Windows Task Scheduler 미등록 |
| Chrome Extension | 빈 폴더 | ❌ | 코드 0줄 |
| `aggregate_hourly.py` | ✅ | ✅ | SSH 로그만 집계 (의미 없음) |
| `daily_report.py` | ✅ | ✅ | activity 데이터 없어서 빈 리포트 |
| Telegram bot (listener+worker) | ✅ | ✅ | 잘 돌아감 |
| `add_todo` MCP tool | ✅ | ✅ | Claude 판단으로 투두 추가됨 |
| DailyPlanEditor UI | ✅ | ✅ | AI 생성 안 써봄, 드래그 안 됨 |
| Plan vs Actual 비교 | ❌ | ❌ | 설계조차 없음 |

### DB 데이터 현실 (2026-03-02 기준)

- `activity_logs`: 479건 (전부 SSH/shell — PC 활동 0건)
- `hourly_summaries`: shell/ssh만 집계 (무의미)
- `daily_reports_v2.stats`: plan 필드 없음 (AI 생성 한 번도 안 씀)
- `todos`: 10건 (전부 telegram, priority 0, due_date null)

---

## 3. 새 아키텍처

### 전체 구조도

```
                    ┌─────────────────────────────────┐
                    │         사용자 (텔레그램)          │
                    │                                 │
                    │  "보고서 마감, 3시 회의, 팀버핏"    │
                    └────────────────┬────────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │        Layer 2: 계획             │
                    │                                 │
                    │  아침 8:30 알림 (자동)            │
                    │  → 사용자 자연어 입력              │
                    │  → Claude: 투두 추출 + 시간 추정   │
                    │  → 고정블록 사이에 자동 배치        │
                    │  → 계획 확인 메시지 발송            │
                    └────────────────┬────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                          │                           │
┌───────▼────────┐    ┌───────────▼──────────┐    ┌──────────▼─────────┐
│ Layer 1: 수집   │    │   Supabase (저장)     │    │  Layer 3: 리뷰     │
│                │    │                      │    │                    │
│ [Windows PC]   │    │  activity_logs       │    │  밤 22:00 (자동)    │
│ ┌────────────┐ │    │  hourly_summaries    │    │  → raw 데이터 수집   │
│ │ PS1 트래커  │─┼───▶│  daily_reports_v2    │◀───┼─ → AI 타임라인 생성  │
│ │ (1분 간격)  │ │    │  todos              │    │  → plan vs actual   │
│ └────────────┘ │    │                      │    │  → 텔레그램 발송     │
│ ┌────────────┐ │    └──────────────────────┘    └────────────────────┘
│ │ Chrome 확장 │─┤
│ │ (탭 변경시) │ │
│ └────────────┘ │
└────────────────┘
```

### 고정 블록 (움직이지 않는 기둥)

```
09:00~09:30   아침식사 (또띠아 랩)
12:00~13:00   점심 (웜샐러드)
15:00~15:20   간식 (고구마+계란)
18:00~18:30   저녁 (배달)
19:00~20:00   팀버핏
```

AI는 이 기둥을 절대 안 움직이고, 사이 빈 슬롯에만 업무를 배치.

---

## 4. Layer 1: 자동 수집 (상세)

### 4.1 Windows Activity Tracker

**파일:** `scripts/activity_tracker.ps1` (이미 존재)

**동작:**
- Win32 API로 포그라운드 윈도우 제목 + 프로세스 이름 캡처
- 60초마다 Supabase `activity_logs`에 POST
- 예시 데이터:
  ```json
  {"window_title": "정산보고서.xlsx - Excel", "app_name": "EXCEL.EXE", "recorded_at": "..."}
  {"window_title": "카카오톡", "app_name": "KakaoTalk.exe", "recorded_at": "..."}
  ```

**배포 (1회 설정):**
1. Windows Task Scheduler에 등록 (로그온 시 자동 시작)
2. 환경변수 설정: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
3. 실행 확인: DB에 데이터 들어오는지 체크

**한계:** "Chrome"이라고만 나옴 → 어떤 사이트인지 모름 → Chrome Extension 필요

### 4.2 Chrome Extension (새로 만들어야 함)

**목적:** 브라우저에서 어떤 사이트/페이지를 보고 있는지 자동 기록

**구조:**
```
extension/
├── manifest.json          # Manifest V3, permissions: tabs, alarms
├── background.js          # Service Worker
│   ├── onActivated        # 탭 전환 시 → 기록
│   ├── onUpdated          # 페이지 로드 시 → 기록
│   └── alarm (30초)       # 30초마다 현재 탭 → 기록
└── config.js              # Supabase URL/Key (환경별)
```

**기록 데이터:**
```json
{
  "window_title": "정산보고서 검토 - Google Docs",
  "app_name": "Chrome",
  "url": "https://docs.google.com/document/d/xxx",
  "source": "extension",
  "recorded_at": "2026-03-02T09:15:00Z"
}
```

**설치:** 회사 PC Chrome에서 개발자 모드 → "압축해제된 확장 프로그램 로드"

### 4.3 DB 스키마 변경

```sql
-- activity_logs에 2개 필드 추가
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'tracker';
-- source 값: 'tracker' (PS1), 'extension' (Chrome), 'manual' (웹UI), 'ssh' (SSH트래커)
```

### 4.4 Enhanced Aggregation

**현재:** 앱 이름 카운트만 (`shell 7분, ssh 1분`)

**변경:** AI 카테고리 분류 추가

```python
# aggregate_hourly.py 개선
# 1. 기존: 앱별 분 수 집계 (유지)
# 2. 추가: 연속된 같은 앱 사용을 "세션"으로 묶기
# 3. 추가: 세션별 카테고리 자동 분류 (Gemini CLI)
#
# 예시:
# Raw: [Excel 09:00, Excel 09:01, ..., Excel 09:45, Chrome 09:46, ...]
# Session: [{app: "Excel", title: "정산보고서", start: "09:00", end: "09:45", minutes: 45}]
# Categorized: [{...session, category: "업무/정산"}]
```

**카테고리 분류 방식:**
- 1차: 규칙 기반 (YouTube → 여가, Excel → 업무, KakaoTalk → 커뮤니케이션)
- 2차: 타이틀 기반 판단이 필요한 경우 → Gemini CLI 배치 호출 (하루 1회)

---

## 5. Layer 2: 계획 시스템 (상세)

### 5.1 아침 알림 서비스 (새로 만듦)

**파일:** `scripts/morning_plan.py`
**서비스:** `secretary-morning-plan.timer` (매일 08:30 KST)

**플로우:**
```
08:30 타이머 발동
    │
    ├─ 어제 리뷰 가져오기 (daily_reports_v2.stats.review)
    ├─ 오늘 기존 투두 가져오기 (todos where is_done=false)
    ├─ 오늘 요일/날짜 확인
    │
    ▼
텔레그램으로 발송:
    "☀️ 좋은 아침! 오늘은 3월 2일 월요일이야.

    📋 밀린 할일:
    • 보고서 마감 (P2)
    • 자료 정리

    어제 리뷰: 달성률 75%, 오후 집중력 부족

    오늘 뭐 할 거야? 자유롭게 말해줘."
    │
    ▼
사용자 응답 (자연어):
    "보고서 오전 중 마감, 3시에 팀장 회의 30분,
     나머지 시간 자료 정리"
    │
    ▼
Claude (worker) 처리:
    1. 투두 추출/업데이트
       - "보고서 마감" → priority: 2 (긴급), due_date: 오늘
       - "팀장 회의" → priority: 1, 시간 지정: 15:00~15:30
       - "자료 정리" → priority: 0

    2. 타임블록 자동 생성
       09:00~09:30  ██ 아침식사 [고정]
       09:30~12:00  ▒▒ 보고서 마감 (2.5h) ← 가장 중요 → 오전 배치
       12:00~13:00  ██ 점심 [고정]
       13:00~15:00  ▒▒ 자료 정리 (2h)
       15:00~15:20  ██ 간식 [고정]
       15:20~15:50  ▒▒ 팀장 회의 (30min) ← 시간 지정됨
       15:50~18:00  ▒▒ 자료 정리 계속 (2h)
       18:00~18:30  ██ 저녁 [고정]
       19:00~20:00  ██ 팀버핏 [고정]

    3. 텔레그램으로 계획 전송
    4. daily_reports_v2.stats.plan에 저장
```

### 5.2 수시 변경

사용자가 낮 중에 텔레그램으로:
- "3시 회의 취소됐어" → Claude가 plan에서 제거 + 빈 슬롯에 다른 투두 배치
- "급한 거 들어왔어, 이거 먼저" → 재배치
- "오늘 팀버핏 못 가" → 고정블록 일시 해제

### 5.3 MCP 도구 추가/변경

**새 도구:**
```python
# save_daily_plan(date, plan_blocks, plan_text)
# → daily_reports_v2.stats.plan에 저장

# get_daily_plan(date)
# → 오늘의 계획 + 투두 + 고정블록 반환

# update_plan_block(date, block_index, changes)
# → 특정 블록 수정 (시간 변경, 삭제 등)
```

**기존 도구 개선:**
```python
# add_todo 개선
# → due_date 자동 설정 (언급 안 하면 오늘)
# → estimated_minutes 필드 추가 (AI가 추정)
# → time_hint 필드 추가 ("오전", "3시", "점심 후" 등)
```

### 5.4 CLAUDE.md 시스템 프롬프트 추가

```markdown
## 데일리 플래너 워크플로우

### 아침 계획 요청 시
사용자가 오늘 할 일을 자연어로 말하면:
1. 각 항목에서 투두를 추출 (add_todo 호출)
2. 각 투두에 예상 소요시간 추정
3. 고정 블록 사이 빈 슬롯에 우선순위대로 배치
4. save_daily_plan 호출로 저장
5. 포맷된 시간표를 텔레그램으로 전송

### 고정 블록 (절대 변경 금지)
- 09:00~09:30 아침식사
- 12:00~13:00 점심
- 15:00~15:20 간식
- 18:00~18:30 저녁
- 19:00~20:00 팀버핏

### 배치 규칙
- 가장 중요한(P2+) 업무 → 오전 09:30~12:00 (집중력 최고)
- 회의/미팅 → 지정 시간 우선, 없으면 오후
- 덜 중요한 업무 → 오후 13:00~18:00
- 버퍼 30분 → 어딘가에 빈 블록 하나 남기기
```

---

## 6. Layer 3: 리뷰 시스템 (상세)

### 6.1 일일 타임라인 생성

**목적:** 하루 치 activity_logs를 의미 있는 활동 블록으로 변환

**파일:** `scripts/generate_timeline.py`

**알고리즘:**
```
1. activity_logs에서 오늘(08:00~24:00) 데이터 가져오기
2. recorded_at 기준 정렬
3. 연속된 같은 앱/유사한 윈도우 타이틀을 하나의 "세션"으로 병합
   - 같은 앱이 3분 이상 연속 → 하나의 세션
   - 2분 이상 데이터 없음 → 세션 종료 (자리 비움으로 추정)
4. 각 세션에 카테고리 자동 분류
   - 규칙 기반 1차: {Excel: 업무, YouTube: 여가, KakaoTalk: 소통, ...}
   - 제목 기반 2차: "정산보고서" → 업무/정산, "먹방" → 여가/유튜브
5. 결과 → daily_reports_v2.stats.actual에 저장

예시 결과:
[
  {"start": "09:00", "end": "09:25", "activity": "아침식사", "category": "식사", "source": "fixed"},
  {"start": "09:30", "end": "10:15", "activity": "정산보고서 작업", "category": "업무", "app": "Excel"},
  {"start": "10:15", "end": "10:45", "activity": "카카오톡", "category": "소통", "app": "KakaoTalk"},
  {"start": "10:45", "end": "11:50", "activity": "정산보고서 작업", "category": "업무", "app": "Excel"},
  {"start": "12:00", "end": "12:50", "activity": "점심", "category": "식사", "source": "fixed"},
  ...
]
```

### 6.2 Plan vs Actual 비교

**파일:** `scripts/evening_review.py`
**서비스:** `secretary-evening-review.timer` (매일 22:00 KST)

**비교 로직:**
```
계획 블록 하나하나에 대해:
  1. 해당 시간대의 actual 블록들을 가져옴
  2. 카테고리/내용이 일치하는지 판단
  3. 일치 → ✅, 불일치 → ❌ + 실제로 뭐 했는지

예시:
┌─────────────────┬──────────────────┬───────┐
│ 계획             │ 실제              │ 판정   │
├─────────────────┼──────────────────┼───────┤
│ 09:30~12:00     │ 09:30~10:15 보고서│       │
│ 보고서 마감      │ 10:15~10:45 카톡  │ 70%   │
│ (2.5h)          │ 10:45~11:50 보고서│       │
├─────────────────┼──────────────────┼───────┤
│ 13:00~15:00     │ 13:00~13:40 자료  │       │
│ 자료 정리        │ 13:40~14:30 YouTube│ 40%  │
│ (2h)            │ 14:30~15:00 자료  │       │
├─────────────────┼──────────────────┼───────┤
│ 15:20~15:50     │ 15:20~15:45 회의  │ ✅    │
│ 팀장 회의        │                  │       │
└─────────────────┴──────────────────┴───────┘

전체 달성률: 70%
이탈 시간: 카톡 30분, YouTube 50분
```

### 6.3 리뷰 메시지 발송

**텔레그램 메시지 형식:**
```
📊 오늘의 리뷰 (3월 2일 월요일)

✅ 달성률: 70%

📋 블록별 결과:
• 보고서 마감 (09:30~12:00): 70% — 카톡 30분 끼어듦
• 자료 정리 (13:00~15:00): 40% — YouTube 50분 이탈
• 팀장 회의 (15:20~15:50): ✅ 완료

⚠️ 이탈 포인트:
• 10:15~10:45 카카오톡 (30분)
• 13:40~14:30 YouTube (50분)

💡 내일 팁:
카톡은 점심 전후로 몰아서 확인하고, 오후 2~3시 집중력 저하 구간에
제로 콜라 + 간식으로 대응하세요.

🏋️ 운동: 팀버핏 ✅
🍽️ 식단: 4끼 고정블록 지킴 ✅
```

### 6.4 stats JSONB 최종 구조

```json
{
  "plan": [
    {"start": "09:30", "end": "12:00", "task": "보고서 마감", "category": "업무", "priority": 2}
  ],
  "plan_text": "보고서 마감이 가장 중요, 오전 집중",
  "actual": [
    {"start": "09:30", "end": "10:15", "activity": "정산보고서", "category": "업무", "app": "Excel"},
    {"start": "10:15", "end": "10:45", "activity": "카카오톡", "category": "소통", "app": "KakaoTalk"}
  ],
  "review": {
    "adherence_pct": 70,
    "blocks": [
      {
        "planned": "보고서 마감 09:30~12:00",
        "actual_summary": "보고서 70%, 카톡 30분 끼어듦",
        "match_pct": 70
      }
    ],
    "distractions": ["카카오톡 30분", "YouTube 50분"],
    "exercise": true,
    "meals": true,
    "summary": "보고서 완료했지만 오후 집중력 떨어짐",
    "tip": "오후 2~3시 제로 콜라 + 장소 이동"
  },
  "fixed_blocks": [
    {"start": "09:00", "end": "09:30", "label": "아침", "type": "meal"},
    {"start": "12:00", "end": "13:00", "label": "점심", "type": "meal"},
    {"start": "15:00", "end": "15:20", "label": "간식", "type": "meal"},
    {"start": "18:00", "end": "18:30", "label": "저녁", "type": "meal"},
    {"start": "19:00", "end": "20:00", "label": "팀버핏", "type": "exercise"}
  ]
}
```

---

## 7. 서비스 전체 목록

### 유지 (기존)

| 서비스 | 타입 | 시간 | 역할 |
|-------|------|------|------|
| `secretary-listener` | 상시 | 24h | 텔레그램 메시지 수신 |
| `secretary-worker` | 상시 | 24h | Claude로 메시지 처리 |
| `secretary-hourly` | 타이머 | 매시 :05 | activity_logs → hourly_summaries 집계 |
| `secretary-daily-report` | 타이머 | 07:00 | 일일 리포트 생성 (Gemini CLI) |

### 변경

| 서비스 | 변경 내용 |
|-------|----------|
| `secretary-hourly` | AI 카테고리 분류 + 세션 병합 로직 추가 |
| `secretary-daily-report` | stats.actual + stats.review 데이터 포함하도록 개선 |
| `secretary-ssh-tracker` | **제거** 또는 유지 (가치 낮음) |

### 신규

| 서비스 | 타입 | 시간 | 역할 |
|-------|------|------|------|
| `secretary-morning-plan` | 타이머 | 08:30 | 아침 플래닝 알림 발송 |
| `secretary-evening-review` | 타이머 | 22:00 | 일일 타임라인 생성 + plan vs actual 비교 + 발송 |

### Windows PC (신규)

| 구성요소 | 타입 | 간격 | 역할 |
|---------|------|------|------|
| `activity_tracker.ps1` | Task Scheduler | 로그온 시 시작, 1분 루프 | 포그라운드 앱+타이틀 기록 |
| Chrome Extension | 상시 | 탭 변경 + 30초 | 브라우저 URL+제목 기록 |

---

## 8. DB 변경사항

### activity_logs 테이블 확장

```sql
-- 새 필드 추가
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'tracker';

-- source 값:
-- 'tracker'   = activity_tracker.ps1 (Windows 앱)
-- 'extension' = Chrome Extension (브라우저 탭)
-- 'manual'    = 웹 UI 수동 입력
-- 'ssh'       = SSH 트래커 (기존)

-- 인덱스 추가 (날짜별 조회 성능)
CREATE INDEX IF NOT EXISTS idx_activity_logs_recorded_at ON activity_logs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source);
```

### todos 테이블 확장

```sql
-- 시간 추정 + 시간 힌트
ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS time_hint VARCHAR(50);
-- time_hint 예: "오전", "15:00", "점심 후", null(AI 판단)
```

### daily_reports_v2 변경 없음
- stats JSONB에 plan/actual/review 필드 추가 (스키마리스)
- 기존 필드 보존 (spread merge 패턴)

---

## 9. Chrome Extension 상세 설계

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "Secretary Tracker",
  "version": "1.0",
  "description": "자동 브라우저 활동 기록",
  "permissions": ["tabs", "alarms", "activeTab"],
  "background": {
    "service_worker": "background.js"
  },
  "host_permissions": ["https://mwahabvsteokswykikgh.supabase.co/*"]
}
```

### background.js 핵심 로직
```javascript
const SUPABASE_URL = 'https://mwahabvsteokswykikgh.supabase.co';
const SUPABASE_KEY = '...'; // service key
const INTERVAL_SECONDS = 30;

let lastUrl = '';
let lastTitle = '';
let lastSentAt = 0;

// 탭 변경 시
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  await logActivity(tab);
});

// 페이지 로드 완료 시
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await logActivity(tab);
  }
});

// 30초마다 현재 탭 기록 (같은 페이지 머무는 경우)
chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'heartbeat') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await logActivity(tab);
  }
});

async function logActivity(tab) {
  if (!tab?.url || tab.url.startsWith('chrome://')) return;

  const now = Date.now();
  // 중복 방지: 같은 URL이고 10초 이내면 스킵
  if (tab.url === lastUrl && now - lastSentAt < 10000) return;

  lastUrl = tab.url;
  lastTitle = tab.title;
  lastSentAt = now;

  await fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      window_title: tab.title || 'Unknown',
      app_name: 'Chrome',
      url: tab.url,
      source: 'extension'
    })
  });
}
```

### 보안 고려
- Service Key가 extension에 포함됨 → **개인용이므로 수용 가능**
- Chrome Web Store 배포 안 함 → 본인 PC에만 설치
- 내부 페이지(chrome://, about:) 필터링

---

## 10. 구현 순서 (Phase별)

### Phase 1: 자동 수집 살리기 (Day 1)
> 목표: activity_logs에 실제 PC 활동 데이터가 들어오게 만들기

1. **회사 PC에서 activity_tracker.ps1 설정**
   - 환경변수 설정 (SUPABASE_URL, SUPABASE_SERVICE_KEY)
   - Task Scheduler 등록
   - 5분 후 DB 확인 → 데이터 들어오는지 검증

2. **Chrome Extension 만들기 + 설치**
   - 위 설계대로 3개 파일 작성
   - 회사 PC Chrome에 로드
   - 사이트 이동하면서 DB 확인

3. **DB 스키마 마이그레이션**
   - activity_logs에 url, source 필드 추가
   - todos에 estimated_minutes, time_hint 필드 추가

### Phase 2: 계획 시스템 (Day 2-3)
> 목표: 텔레그램으로 자연어 입력하면 시간표가 만들어지게

1. **MCP 도구 추가** (save_daily_plan, get_daily_plan)
2. **CLAUDE.md 업데이트** (플래닝 워크플로우 + 고정블록 + 배치 규칙)
3. **morning_plan.py 스크립트 + systemd timer**
4. **테스트**: 텔레그램으로 "오늘 보고서랑 회의" → 시간표 생성 확인

### Phase 3: 리뷰 시스템 (Day 4-5)
> 목표: 하루 끝에 계획 vs 실제 비교 리뷰가 자동 발송

1. **generate_timeline.py** (raw logs → 세션 블록 → 카테고리 분류)
2. **evening_review.py** (plan vs actual 비교 + 리뷰 생성)
3. **systemd timer** (22:00 KST)
4. **테스트**: 하루 치 데이터로 리뷰 생성 확인

### Phase 4: UI 리뉴얼 (Day 6-8)
> 목표: Secretary 웹에서 시각적으로 계획/실제 확인

1. **데일리 플래너 페이지 리디자인**
   - 왼쪽: 투두리스트 (드래그 소스)
   - 오른쪽: 타임라인 (드래그 타겟 + 고정블록 표시)
2. **Plan vs Actual 비교 뷰**
   - 계획 타임라인 | 실제 타임라인 나란히
   - 색상으로 일치/불일치 표시
3. **주간 대시보드**
   - 일주일 달성률 트렌드
   - 주요 이탈 패턴

### Phase 5: 고도화 (이후)
- AI 카테고리 분류 정확도 개선
- 폰 활동 추적 (Android)
- 주간/월간 리뷰 자동 생성
- 노션 자동 동기화

---

## 11. 기술 원칙

1. **API 키 사용 금지** — 모든 AI 호출은 CLI 방식 (Claude CLI, Gemini CLI)
   - 현재 daily-plan/route.ts의 ANTHROPIC_API_KEY 직접 사용 → CLI로 교체
2. **기존 구조 최대 활용** — 테이블 추가 최소화, JSONB stats 활용
3. **점진적 배포** — Phase 1부터 각 단계 검증 후 다음 진행
4. **실패해도 안전** — 수집 실패해도 앱 안 죽음, 리뷰 실패해도 데이터 유지
