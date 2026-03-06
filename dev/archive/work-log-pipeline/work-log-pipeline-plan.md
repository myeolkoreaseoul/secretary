# work-log-pipeline 계획

## 목적
Claude Code 세션에서 발생하는 **성과 로그**(뭘 만들고, 뭘 고쳤는지)를 자동 수집하여
Secretary의 daily_reports_v2에 저장하고, evening_review와 Notion 일일 기록에 통합한다.

## 현재 상태 (AS-IS)

```
[Claude Code 세션]
  ↓ pre-compact 훅
  ↓ claude -p 의미론적 요약
  ↓
~/.claude/handover/latest.md  ← 마지막 1개만 덮어쓰기. 하루 여러 세션이면 유실.
                                evening_review와 연결 없음.
                                Notion 반영은 수동.

[Secretary evening_review]
  ↓
stats.actual ← activity_logs 기반 (앱 사용 시간만)
stats.review ← plan vs actual (앱 수준 비교만)
  → "Chrome 3시간" 알지만 "GitHub MCP 세팅했다"는 모름
```

**핵심 갭**: 의미론적 성과(뭘 완성했는지)가 daily_reports_v2에 없음.

## 목표 상태 (TO-BE)

```
[Claude Code 세션]
  ↓ pre-compact 훅 (수정)
  ↓ latest.md + work-logs/{date}.jsonl 에 누적 저장
  ↓
~/.claude/handover/work-logs/2026-03-05.jsonl  ← 하루치 세션 요약 누적

[새 스크립트: aggregate_work_logs.py] (22:00, evening_review 직전)
  ↓ work-logs/{date}.jsonl 읽기
  ↓ daily_reports_v2.stats.work_log 에 저장
  ↓
evening_review.py (수정)
  ↓ stats.work_log 참조하여 리뷰에 성과 요약 포함
  ↓ 텔레그램 리뷰 메시지에 "오늘 뭘 했는지" 포함

[새 스크립트: sync_notion_daily.py] (22:30, evening_review 후)
  ↓ stats.work_log + stats.review 읽기
  ↓ Notion 일일 페이지 자동 생성/업데이트
```

## 데이터 구조

### work-logs/{date}.jsonl (한 줄 = 한 세션 요약)
```json
{
  "timestamp": "2026-03-05T03:59:21Z",
  "session_id": "8b782162-...",
  "cwd": "/home/john",
  "summary": "GitHub MCP 설정 완료 (gh auth + gh-mcp 설치 + .claude.json 설정)",
  "files": ["/home/john/.claude.json", "/home/john/.config/gh/hosts.yml"],
  "tags": ["infra", "mcp", "github"]
}
```

### daily_reports_v2.stats.work_log
```json
{
  "entries": [
    {"time": "03:59", "summary": "GitHub MCP 설정 완료", "tags": ["infra"]},
    {"time": "05:42", "summary": "pre-compact 훅 버그 수정", "tags": ["bugfix"]}
  ],
  "total_sessions": 3,
  "top_tags": ["infra", "bugfix", "secretary"]
}
```

---

## 섹션 목록

### 섹션 1: pre-compact 훅 수정 (work-logs 누적 저장)
- **목적**: handover/latest.md 덮어쓰기 외에, work-logs/{date}.jsonl에 세션별 요약을 append
- **파일**: `~/.claude/hooks/custom/pre-compact.mjs`
- **변경**:
  - latest.md 저장 로직 유지
  - 추가: `~/.claude/handover/work-logs/{YYYY-MM-DD}.jsonl`에 JSON 한 줄 append
  - JSON 필드: timestamp, session_id, cwd, summary(의미론적 요약에서 추출), files
- **완료 기준**: 컴팩션 발생 시 work-logs/{date}.jsonl에 항목 추가됨
- **의존**: 없음

### 섹션 2: aggregate_work_logs.py (일일 성과 집계)
- **목적**: work-logs/{date}.jsonl → daily_reports_v2.stats.work_log 저장
- **파일**: `scripts/aggregate_work_logs.py` (신규)
- **로직**:
  1. `~/.claude/handover/work-logs/{date}.jsonl` 읽기
  2. 중복 session_id 제거
  3. 시간순 정렬
  4. tags 집계 (top_tags)
  5. daily_reports_v2.stats.work_log에 spread merge 저장
- **재사용**: bot.supabase_client 패턴, bot.config (SUPABASE_REST_URL, SUPABASE_HEADERS)
- **완료 기준**: `python3 -m scripts.aggregate_work_logs` 실행 → stats.work_log 저장 확인
- **의존**: 섹션 1 완료 후

### 섹션 3: evening_review.py 수정 (성과 통합)
- **목적**: 리뷰에 work_log 성과 요약 포함
- **파일**: `scripts/evening_review.py` (수정)
- **변경**:
  - stats에서 work_log 로드
  - build_review()에 `achievements` 필드 추가 (work_log.entries에서 summary 추출)
  - 트리거 메시지에 "오늘 성과" 섹션 추가
- **완료 기준**: 텔레그램 리뷰 메시지에 성과 목록 포함
- **의존**: 섹션 2 완료 후

### 섹션 4: sync_notion_daily.py (노션 자동 동기화)
- **목적**: 매일 22:30에 일일 성과 + 리뷰를 노션에 자동 반영
- **파일**: `scripts/sync_notion_daily.py` (신규)
- **로직**:
  1. daily_reports_v2에서 당일 stats (work_log + review) 로드
  2. 노션 API로 일일 페이지 생성 또는 업데이트
  3. 구조: 제목 "YYYY-MM-DD 일일 기록", 본문에 성과 목록 + 리뷰 요약
- **노션 API**: `NOTION_TOKEN` 환경변수 사용 (기존 ~/.claude.json의 토큰과 동일)
- **완료 기준**: 노션에 일일 페이지 자동 생성
- **의존**: 섹션 3 완료 후

### 섹션 5: systemd 타이머 설정
- **목적**: aggregate_work_logs(22:00), evening_review(22:05), sync_notion_daily(22:30) 자동 실행
- **파일**: `~/.config/systemd/user/secretary-work-log.{service,timer}`, `secretary-notion-sync.{service,timer}`
- **참고**: 기존 morning-plan 타이머 패턴 복사
- **완료 기준**: `systemctl --user status` 정상, 수동 실행 테스트 통과
- **의존**: 섹션 4 완료 후

### 섹션 6: E2E 테스트 + 정리
- **목적**: 전체 파이프라인 수동 실행 검증
- **테스트 순서**:
  1. pre-compact 훅 수동 트리거 → work-logs/{date}.jsonl 확인
  2. aggregate_work_logs.py → stats.work_log 확인
  3. evening_review.py → 텔레그램 메시지에 성과 포함 확인
  4. sync_notion_daily.py → 노션 페이지 생성 확인
  5. systemd 타이머 상태 확인
- **완료 기준**: 전 구간 데이터 정상 흐름
- **의존**: 섹션 5 완료 후
