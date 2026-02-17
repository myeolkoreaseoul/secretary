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
