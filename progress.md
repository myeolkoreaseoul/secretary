# 원격 코딩 기능 추가 — 진행 상황

## Phase 1: 기반 (세션 + 타임아웃) — 완료
- [x] `/home/john/projects/workspace/` 디렉토리 생성
- [x] `worker.py`에 세션 관리 함수 추가 (sessions.json, fcntl, 2hr TTL)
- [x] `run_claude()` 재작성 (--output-format json, --resume, timeout=600, cwd=workspace)

## Phase 2: MCP 도구 — 완료
- [x] `mcp_server.py`에 send_progress, send_file, get_pending_messages 추가

## Phase 3: 시스템 프롬프트 — 완료
- [x] `CLAUDE.md`에 코딩 워크플로우 + 도구 문서 + workspace 규칙 추가

## Phase 4: 메시지 배치 — 완료
- [x] `supabase_client.py`에 `dequeue_message_for_chat()` + `get_pending_messages_for_chat()` 추가
- [x] `worker.py`에 `drain_messages()` 추가 + `process_one()` 수정

## Phase 5: 배포 — 완료
- [x] systemd 서비스 업데이트 (TimeoutStopSec=620, ReadWritePaths)
- [x] systemd 재시작 + worker 정상 가동 확인

## 코덱스 리뷰 — 완료
30개 이슈 발견, critical/high 수정 완료:
- [x] #9 CRITICAL: `send_file` path traversal → `is_relative_to()` 사용
- [x] #2 HIGH: session file truncation race → 별도 lock file + atomic rename
- [x] #3 MEDIUM: TOCTOU in load_sessions → try/except FileNotFoundError
- [x] #4 MEDIUM: load-modify-save race → 단일 exclusive lock으로 전체 사이클 보호
- [x] #5 MEDIUM: env var 빈 문자열 → `env.pop()` (완전 삭제)
- [x] #1 HIGH: `_current_chat_id` 글로벌 → chat_id 명시적 파라미터 전달
- [x] #16 HIGH: dequeue race condition → PATCH에 `status=eq.pending` 가드 추가
- [x] #12 MEDIUM: geocoding URL injection → httpx params 사용

## QA 테스트 — 20/20 x 20회 = 400/400 PASS
| # | 테스트 | 상태 |
|---|--------|------|
| 01 | DB: get_categories | PASS |
| 02 | DB: get_recent_messages | PASS |
| 03 | DB: enqueue + dequeue | PASS |
| 04 | DB: complete_message | PASS |
| 05 | DB: fail_message | PASS |
| 06 | DB: save_message + classify | PASS |
| 07 | DB: add_todo | PASS |
| 08 | DB: dequeue_message_for_chat (NEW) | PASS |
| 09 | DB: get_pending_messages_for_chat (NEW) | PASS |
| 10 | DB: dequeue race guard (NEW) | PASS |
| 11 | Embedding: generate (768-dim) | PASS |
| 12 | Embedding: model name | PASS |
| 13 | DB: vector search | PASS |
| 14 | Telegram: send_message | PASS |
| 15 | MCP: import check | PASS |
| 16 | Worker: session set/get/clear (NEW) | PASS |
| 17 | Worker: session TTL expiry (NEW) | PASS |
| 18 | Worker: drain_messages batching (NEW) | PASS |
| 19 | MCP: path traversal blocked (NEW) | PASS |
| 20 | Workspace directory exists (NEW) | PASS |

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `bot/worker.py` | 세션 관리(atomic lock+rename), JSON 파싱, --resume, timeout 600s, cwd=workspace, 메시지 배치, chat_id 명시 전달 |
| `bot/mcp_server.py` | send_progress, send_file(is_relative_to), get_pending_messages, geocoding params fix |
| `bot/CLAUDE.md` | 코딩 워크플로우 섹션, workspace 규칙, 금지사항 수정 |
| `bot/supabase_client.py` | dequeue_message_for_chat(), get_pending_messages_for_chat(), dequeue race guard |
| `secretary-worker.service` | TimeoutStopSec=620, ReadWritePaths |
| `bot/tests/test_qa.py` | 20개 테스트 스크립트 (NEW) |

## 남은 작업
- [ ] E2E 텔레그램 테스트: "안녕" → 세션 저장 확인
- [ ] E2E 코딩 테스트: "hello world HTML 만들어줘" → 진행 보고 + 파일 전송

---

## 2026-03-06: Phase 3 LLM Council — CLI 기반 구현 (WIP, 브랜치: feat/phase3-council-wip)
- bot/multi_model.py 신규: 3개 CLI 병렬 실행 + Council 3단계(Collect→Review→Synthesize)
- telegram /council 명령 + MCP council_query 도구 + DB 저장
- 테스트 통과: 3모델 병렬 OK, graceful degradation OK, council quick OK (42초)
- systemd PATH 수정 (listener + worker)
- **문제**: 기존 AI Gateway(ai_gateway.py) 아키텍처를 무시하고 CLI subprocess로 구현함
- **결론**: 제로베이스 재설계 필요. CLI vs Gateway 방향성 결정 후 재구현 예정
- 현재 코드는 WIP 브랜치에 보존, master 미머지

## 2026-03-07: lilys.ai 리버스 엔지니어링 (리서치 완료)
- lilys.ai 클론 프로젝트 사전 조사 완료
- LLM 모델 확정: OpenAI GPT-4o(유료), GPT-3.5(무료), Whisper(STT)
- API 구조 파악: FastAPI(uvicorn) + SSE 스트림 + Firebase Auth + AWS Lambda
- SSE 이벤트 구조, 요청 body 포맷, 인증 흐름 전체 매핑
- 프론트엔드: TipTap ProseMirror + 커스텀 HTML 요소 + Redux
- 상세: `~/.claude/projects/-home-john/memory/lilys-research.md`
- 다음: CDP 크롤러 구현 → 124개 영상 벤치마크 수집

## 2026-03-07: AI 대화 프론트엔드 + 핵심 비전 정리

### AI 대화 UI 구현
- 사이드바에 "AI 대화" 메뉴 추가 (Bot 아이콘)
- /conversations — 목록 페이지: provider 필터(Claude/Codex/Gemini), 검색, 페이지네이션
- /conversations/[id] — 상세 페이지: 메시지 뷰어(role별 구분, 토큰수, 더보기)
- Vercel 배포 완료

### Secretary 핵심 비전 — 4축 + 마일스톤
토론을 통해 Secretary의 본질적 방향을 정립:

**축 1. 입력 장벽 제로** — UI가 슬랙/디스코드급이어야 함. 현재 "관리자 대시보드" 느낌 → 채팅 중심 UI로 전환 필요
**축 2. 자동 토픽 분리** — 텔레그램 파이프라인에 멀티 분류(items[]) 도입 필요
**축 3. 선제적 넛지** — 매일 아침 "오늘 신경 쓸 것" 전송, 미완료 약속 추적, 주간 패턴 인사이트
**축 4. 소스 발굴/큐레이션** — 사용자 관심사 기반 콘텐츠 자동 수집 (최후단, Scouter 합류점)

마일스톤:
- M1: UI 리디자인 (슬랙/디스코드 레퍼런스)
- M2: 텔레그램 멀티 분류
- M3: Daily Nudge 엔진
- M4: 미완료 추적 + 주간 인사이트
- M5: 소스 큐레이션 (Scouter 연동)

## 2026-03-07
- Bot-1 (스트리밍 최적화): asyncio.create_subprocess_exec + --output-format stream-json 도입 → 체감 대기 20-30초→2-5초, asyncio.to_thread 제거, session_id type=result에서 직접 추출 (worker.py)
- Bot-2 (웹-텔레그램 컨텍스트 통합): 웹 /api/chat → message_queue INSERT → Worker 처리. OWNER_CHAT_ID(8280174296) 공유 세션으로 텔레그램↔웹 대화 통합. 응답은 Supabase Realtime 수신. (route.ts, page.tsx, .env.local)

## 2026-03-08
- Codex 리뷰 8개 이슈 수정: stderr deadlock(--verbose 추가 후 필수), 재시도 조건 한정, 좀비 프로세스 방지, res.ok 검사, historyLoading race condition, row id 기반 dedup, 슬래시 명령 DB 실패 처리, 공백 메시지 차단
- M1~M2 전체 검증 완료 (Worker, Listener, 웹 UI, message_queue 파이프라인 정상 가동 확인)
- M3~M5는 실사용 후 다음 세션에서 진행 예정
- Brazilian Phonk 프롬프트 생성기 통합: Suno AI용 7장르 프롬프트 생성기를 /phonk 페이지로 추가. generate.sh→TS 포팅, 장르 균등배분, djb2 해시 중복방지, localStorage 히스토리, SlackNav phonk 모드+사이드바
- Pixel Office 엔진 포팅 완료 (Pixel Agents 오픈소스 기반): Canvas 2D 픽셀아트 사무실, OfficeState 캐릭터 상태관리, Z-sorted 렌더링, Matrix spawn/despawn, BFS 경로탐색, HiDPI+줌/패닝. 14파일 3941줄
- Pixel Office 레이아웃 확장: 26x14 사무실 (좌석 20개), 프로젝트 15개 자리 고정, active/paused 라벨 색상 구분

## 2026-03-11: OAuth 토큰 독살 근본 해결
- **문제**: Anthropic OAuth refresh token rotation + reuse detection으로 인해, Secretary가 직접 HTTP refresh하면 토큰 패밀리 전체 revoke
- **해결**: passive consumer 패턴 — HTTP refresh 전면 제거, 디스크 읽기 전용
- oauth_client.py: mark_server_rejected(), poll cooldown, fcntl file locking, JSONDecodeError retry
- credential_watcher.py (신규): watchfiles(inotify)로 credentials.json 변경 즉시 감지
- worker.py: 401 시 mark_server_rejected + reload_from_disk만 호출
- QA 10건 이슈 수정 (자체+Codex+Ralph 20회)
- 프로덕션 테스트 4/6 통과 (기본동작, inotify, 401시뮬, settlement-qna)

## 2026-03-11: context 사전 주입 + 스트리밍 응답 (응답 속도 30초→6초)
- worker.py: API 호출 전 prepare_context 직접 실행, system prompt에 context 주입 (API 왕복 5→1~2회)
- worker.py: Anthropic streaming API + 텔레그램 실시간 타이핑 (1.5초 간격 editMessage)
- mcp_server.py: run_prepare_context/run_respond_and_classify 독립 함수 추출, TOOL_DEFINITIONS 11→9개
- config.py: 기본 모델 Haiku → Sonnet 변경 (품질 개선)
- CLAUDE_FULL/SIMPLE.md: 워크플로우 개편, 테이블/볼드/헤딩 금지, 맥락 연결 강화
