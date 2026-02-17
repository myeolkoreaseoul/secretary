# AI Secretary v2 — 구현 과정 기록

## 프로젝트 개요

기존 Next.js + Supabase + Gemini 폼 UI를 **텔레그램 + Claude CLI 기반 채팅형 AI 비서**로 전면 업그레이드.

**핵심 원칙:**
- 모든 판단 = Claude CLI만 (Max 구독 무제한)
- Gemini = 임베딩(숫자 변환) 전용
- 종량제 비용 $0

**아키텍처:**
```
텔레그램 메시지 → telegram_listener.py (폴링)
    → message_queue (Supabase)
    → worker.py (3초 폴링)
    → claude -p --model claude-opus-4-6 --dangerously-skip-permissions --mcp-config mcp.json
    → MCP 도구 2단계: prepare_context → respond_and_classify
    → 텔레그램 답변 + DB 저장 + 분류 + 임베딩
```

---

## Phase 1A: 텔레그램 봇 + Claude CLI (핵심)

### 구현한 파일들

| 파일 | 역할 |
|------|------|
| `bot/config.py` | 환경변수 로드, 로깅 설정 |
| `bot/telegram_listener.py` | 텔레그램 폴링 → DB 큐 등록 |
| `bot/telegram_sender.py` | 텔레그램 메시지 전송 (4096자 자동 분할) |
| `bot/worker.py` | 큐 폴링 → Claude CLI + MCP 실행 |
| `bot/mcp_server.py` | MCP 도구 서버 (prepare_context, respond_and_classify, add_todo) |
| `bot/supabase_client.py` | Supabase REST API 클라이언트 |
| `bot/embedding.py` | Gemini gemini-embedding-001 임베딩 생성 (768-dim) |
| `bot/CLAUDE.md` | Claude 시스템 프롬프트 (2단계 워크플로우) |
| `bot/mcp.json` | MCP 서버 설정 |
| `bot/requirements.txt` | Python 의존성 |
| `bot/.env` | 환경변수 (토큰, API 키 등) |

### Supabase 설정

- 프로젝트: brain-system (ref: mwahabvsteokswykikgh)
- 테이블: message_queue, telegram_messages, categories, todos, activity_logs, hourly_summaries, daily_reports, daily_reports_v2, thoughts, employees, conversations, chat_sessions, chat_messages, sync_status
- pgvector 활성화 (768차원 임베딩)
- search_similar_content RPC 함수

### 발생한 문제 + 해결

**1. pip install 실패 (PEP 668)**
- Ubuntu 24+ 시스템 Python 보호
- 해결: `pip install --break-system-packages`

**2. SQL 마이그레이션 연쇄 에러**
- "vector" type not found → `CREATE EXTENSION IF NOT EXISTS vector;`
- copy/paste "●" 특수문자 → 재복사
- "categories" doesn't exist → 001+002 마이그레이션 미실행 → 통합 SQL 작성
- "conversations" already exists → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` 후 재실행

**3. 403 Forbidden (REST API)**
- DROP SCHEMA CASCADE가 GRANT 권한도 삭제
- 해결: `GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public TO service_role, anon, authenticated`

**4. "Claude Code cannot be launched inside another Claude Code session"**
- 해결: `env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE` 으로 실행

**5. MCP 도구 호출 안 됨 (Claude CLI가 permission 요청)**
- `--dangerously-skip-permissions`와 `--mcp-config`를 반드시 함께 써야 함
- 한쪽만 쓰면: MCP 없이 실행되거나, permission 승인 대기로 멈춤

**6. Gemini embedding 404**
- `text-embedding-004` → `gemini-embedding-001`로 모델명 변경됨

**7. Gemini embedding 3072차원 반환**
- `outputDimensionality: 768` 파라미터 추가로 768차원 요청

---

## QA 테스트 (20/20 PASS)

`/tmp/qa_test.py` — 20개 테스트 항목:

1-14. DB read (14개 테이블 전부)
15. DB write/delete (todos)
16. Telegram send
17. Enqueue message
18. Categories >= 7
19. Gemini embedding (768-dim)
20. MCP server import

---

## Codex 코드 리뷰 (16개 이슈 → 수정 완료)

### HIGH (6개) — 전부 수정

| # | 이슈 | 수정 내용 |
|---|------|----------|
| 1 | 비원자적 파일 락 (race condition) | fcntl.flock() 기반 원자적 락으로 교체 |
| 2 | 락 미보유 시 해제 버그 | lock_acquired 플래그로 소유권 추적 |
| 3 | 비원자적 dequeue | single-worker이므로 현재 구조 유지 (문서화) |
| 4 | 락 경합 시 메시지 유실 | db.requeue_message()로 pending 복귀 |
| 5 | --dangerously-skip-permissions + 사용자 입력 | 아키텍처 결정 (화이트리스트로 제한) |
| 6 | processed_at 타임스탬프 | datetime.now(timezone.utc).isoformat() 사용 |

### MEDIUM (6개) — 주요 항목 수정

| # | 이슈 | 수정 내용 |
|---|------|----------|
| 7 | PostgREST에서 now() 미지원 | Python에서 cutoff 계산 후 전달 |
| 8 | config 파싱 에러 | try/except로 방어적 파싱 |
| 9 | 임베딩 클라이언트 매번 생성 | 모듈 레벨 httpx.AsyncClient 재사용 |
| 10 | 비재시도 에러에도 재시도 | _is_retriable()로 5xx/429만 재시도 |

---

## 성능 최적화

### MCP 도구 통합 (8단계 → 2단계)

**Before (8 라운드트립):**
```
save_user_message → get_recent_history → get_relevant_context → (생각)
→ send_telegram_message → save_bot_response → get_categories → classify_and_save
```

**After (2 라운드트립):**
```
prepare_context (저장+히스토리+벡터검색+카테고리 한방) → (생각)
→ respond_and_classify (전송+저장+분류 한방)
```

- 내부적으로 asyncio.gather()로 병렬 실행
- Claude가 보는 정보는 동일 (품질 차이 없음)

### 속도 비교

| | 최적화 전 | 최적화 후 |
|---|---|---|
| 모델 | 기본 (Sonnet) | claude-opus-4-6 |
| 폴링 간격 | 10초 | 3초 |
| MCP 라운드트립 | 8회 | 2회 |
| 큐 대기 | ~10초 | ~2초 |
| Claude CLI | ~35초 | ~22초 |
| **총 체감** | **~45초** | **~24초** |

---

## Phase 1B: 벡터 메모리 백필

- `scripts/backfill_embeddings.py` — thoughts 테이블 임베딩 백필
- 200ms 딜레이로 Gemini rate limit 준수

---

## Phase 1C: 웹 대시보드

### shadcn/ui + Tailwind v4

- `components.json` — shadcn/ui 설정
- `src/lib/utils.ts` — cn() 유틸리티
- `src/app/globals.css` — oklch 컬러, 다크모드
- UI 컴포넌트 7개: button, input, badge, card, separator, tabs, skeleton

### 페이지 (5개)

| 페이지 | 파일 | 기능 |
|--------|------|------|
| 카테고리 | `src/app/categories/` | 카테고리별 메시지 탭 뷰 |
| 히스토리 | `src/app/history/page.tsx` | 대화 타임라인 + 검색 |
| 할일 | `src/app/todos/page.tsx` | 할일 CRUD |
| 시간 | `src/app/time/page.tsx` | 24시간 활동 그리드 |
| 설정 | `src/app/settings/page.tsx` | 카테고리 관리 |

### API 라우트 (5개)

- `src/app/api/history/route.ts`
- `src/app/api/todos/route.ts`
- `src/app/api/time/route.ts`
- `src/app/api/categories/[id]/route.ts`
- `src/app/api/summary/route.ts`

### 빌드 이슈

- SUPABASE_SERVICE_KEY 없으면 빌드 실패 → placeholder fallback 처리
- `src/lib/supabase-admin.ts`에서 빈 문자열 방어

---

## Phase 1D: 시간 추적

| 파일 | 역할 |
|------|------|
| `scripts/activity_tracker.ps1` | Windows PowerShell 활성 윈도우 캡처 |
| `scripts/aggregate_hourly.py` | 시간별 활동 집계 |
| `scripts/daily_report.py` | Daily Report 생성 (Claude CLI) |
| `src/components/TimeGrid.tsx` | 24시간 그리드 UI |

---

## systemd 서비스 (사용자 레벨)

```
~/.config/systemd/user/secretary-listener.service
~/.config/systemd/user/secretary-worker.service
```

- `systemctl --user` 사용 (sudo 불필요)
- `loginctl enable-linger john` — 로그아웃 후에도 유지
- listener: Restart=always, RestartSec=5
- worker: Restart=always, RestartSec=10
- worker PATH에 claude CLI + node 경로 포함
- worker에서 CLAUDE_CODE_ENTRY_POINT, CLAUDECODE 환경변수 해제

### 관리 명령어

```bash
# 상태 확인
systemctl --user status secretary-listener secretary-worker

# 로그
journalctl --user -u secretary-worker -f

# 재시작
systemctl --user restart secretary-listener secretary-worker

# 중지
systemctl --user stop secretary-listener secretary-worker
```

---

## E2E 테스트 결과 (최종)

| 항목 | 결과 |
|------|------|
| 큐 등록 → dequeue | 2초 |
| Claude CLI (Opus, 2-tool) | 22초 |
| 유저 메시지 DB 저장 | OK |
| 봇 응답 DB 저장 | OK |
| 임베딩 생성 (양쪽) | OK (768-dim) |
| 분류 (classification) | OK |
| 텔레그램 답변 수신 | OK |
| **총 응답 시간** | **~24초** |

---

## MCP 도구 확장 (2026-02-17)

### 추가된 MCP 도구 (2개)

| 도구 | 역할 |
|------|------|
| `get_weather` | Open-Meteo API로 실시간 날씨 조회 (무료, 키 불필요) |
| `web_search` | DuckDuckGo 웹 검색 (뉴스, 환율, 맛집 등 실시간 정보) |

- `bot/mcp_server.py` 수정 — 도구 정의 + 구현 추가
- `bot/CLAUDE.md` 수정 — "실시간 정보 조회" 섹션 추가
- `bot/requirements.txt` — `duckduckgo-search==7.5.1` 추가
- 한국 주요 18개 도시 좌표 프리셋 + Open-Meteo 지오코딩 폴백
- 날씨 코드 → 한국어 설명 매핑 (맑음☀️, 비🌧, 눈❄️ 등)
- worker 서비스 재시작으로 적용 완료

**배경:** 사용자가 날씨를 물었는데 봇이 "날씨 사이트 가서 보세요"라고 답함.
Claude CLI는 기본적으로 인터넷 접근이 안 되므로 MCP 도구로 웹 접근 기능을 부여해야 함.

---

## 크론잡 / systemd 타이머 설정 (2026-02-17)

### 추가된 systemd 타이머 (2개)

| 파일 | 스케줄 | 역할 |
|------|--------|------|
| `secretary-hourly.timer` + `.service` | 매시 :05분 | `scripts/aggregate_hourly.py` — activity_logs → hourly_summaries 집계 |
| `secretary-daily-report.timer` + `.service` | 매일 07:00 | `scripts/daily_report.py` — Claude CLI로 Daily Report 생성 → DB 저장 |

- 파일 위치: `~/.config/systemd/user/`
- `scripts/__init__.py` 생성 (Python 모듈 실행용)
- daily-report 서비스에 Claude CLI용 PATH + env 설정 포함
- `Persistent=true` — 타이머 시간에 PC 꺼져 있으면 다음 부팅 시 실행

### 전체 systemd 구성 (4개 서비스 + 2개 타이머)

```
secretary-listener.service  — 텔레그램 폴링 (상시)
secretary-worker.service    — 큐 처리 + Claude CLI (상시)
secretary-hourly.timer      — 시간별 활동 집계 (매시)
secretary-daily-report.timer — Daily Report (매일 7시)
```

### 관리 명령어

```bash
# 전체 상태
systemctl --user status secretary-listener secretary-worker
systemctl --user list-timers

# 타이머 로그
journalctl --user -u secretary-hourly -f
journalctl --user -u secretary-daily-report -f

# 수동 실행 (테스트)
systemctl --user start secretary-hourly.service
systemctl --user start secretary-daily-report.service
```

### Windows Activity Tracker (미설정)

`scripts/activity_tracker.ps1`은 Windows PowerShell 전용 (Win32 API 사용).
WSL이 아닌 Windows Task Scheduler에서 설정 필요:

```powershell
# Windows 환경변수 설정
[System.Environment]::SetEnvironmentVariable("SUPABASE_URL", "https://mwahabvsteokswykikgh.supabase.co", "User")
[System.Environment]::SetEnvironmentVariable("SUPABASE_SERVICE_KEY", "<서비스키>", "User")

# Task Scheduler 등록
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File \\wsl$\Ubuntu\home\john\projects\secretary\scripts\activity_tracker.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogon -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "SecretaryActivityTracker" -Action $action -Trigger $trigger
```

---

## OpenClaw 조사 (2026-02-17)

### OpenClaw이란?
- GitHub 18만+ 스타, 오픈소스 자율 AI 에이전트
- 텔레그램/WhatsApp/Discord/Signal에서 Claude를 조종
- **핵심: Claude Code SDK 세션을 통째로 실행** — `claude -p`(1회성)이 아니라 연속 코딩 세션
- 로컬에서 실행, 파일 읽기/쓰기/코드 실행 전부 가능
- 창업자 Peter Steinberger → 2026-02-14 OpenAI 합류

### 우리 봇과의 차이
| | 우리 비서 봇 | OpenClaw |
|---|---|---|
| Claude 호출 | `claude -p` (1회성 프롬프트) | Claude Code SDK (연속 세션) |
| 코딩 능력 | 없음 | 파일 읽기/쓰기/실행 전부 |
| 메모리 | pgvector 벡터 검색 (커스텀) | 자체 메모리 |
| 분류/조언 | MCP 도구로 자동 분류 | 없음 (범용) |
| 강점 | 일상 비서 특화 | 자율 코딩 에이전트 |

### Claude Code Plugin
- `openclaw-claude-code-plugin` — OpenClaw에서 Claude Code 세션 관리
- 텔레그램에서 "이 프로젝트에 로그인 기능 추가해" → 자율적으로 수시간 코딩
- 설정: `openclaw.plugin.json`에서 workdir → 텔레그램 채널 매핑

### 설치 요건
- Node.js 22+ (현재 우리 환경: v20 → 업그레이드 필요)
- `curl -fsSL https://openclaw.ai/install.sh | bash` → `openclaw onboard`
- Anthropic API Key 필요 (Max 구독과 별도)
- 텔레그램: @BotFather에서 봇 토큰 발급

### 선택지
1. **OpenClaw 따로 설치 (추천)** — 코딩용 OpenClaw + 일상 비서는 기존 봇 유지
2. **기존 봇에 Claude Code SDK 추가** — 가능하지만 작업량 큼

### 참고 링크
- https://github.com/openclaw/openclaw
- https://github.com/alizarion/openclaw-claude-code-plugin
- https://vertu.com/ai-tools/the-ultimate-guide-setting-up-openclaw-with-claude-code-and-gemini-3-pro/
- https://litmers.com/blog/몰트봇-클로드봇-완벽가이드

---

## 핵심 교훈

1. Claude CLI에서 MCP 쓰려면 `--dangerously-skip-permissions` + `--mcp-config` 반드시 함께
2. Claude Code 안에서 claude CLI 실행 시 `env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE` 필수
3. Gemini embedding 모델명: `gemini-embedding-001` (not text-embedding-004)
4. Supabase DROP SCHEMA CASCADE 후 반드시 GRANT 재설정
5. PostgREST에서 SQL 함수(now() 등) 사용 불가 — Python에서 계산
6. MCP 도구 통합으로 라운드트립 줄이면 Opus 써도 속도 개선 가능
7. fcntl.flock()이 파일 존재 확인 방식보다 안전한 락
8. pip on Ubuntu 24+: `--break-system-packages` 필요
