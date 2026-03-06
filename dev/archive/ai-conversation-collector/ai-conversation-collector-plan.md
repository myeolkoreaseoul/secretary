# AI Conversation Collector - Plan (SSOT)

## 목표
모든 AI CLI 대화(Claude Code, Codex, Gemini CLI)를 Supabase에 통합 저장하여
History 페이지에서 모든 AI 대화를 한 곳에서 볼 수 있는 기반 구축.

## 데이터 현황
| CLI | 위치 | 형식 | 크기 | 파일 수 |
|-----|------|------|------|---------|
| Claude Code | `~/.claude/projects/*/` | JSONL (sessionId별) | 780MB | ~181개 |
| Codex | `~/.codex/sessions/YYYY/MM/DD/*.jsonl` | JSONL | 31MB | 날짜별 |
| Gemini | `~/.gemini/tmp/{projectHash}/chats/session-*.json` | JSON | 68MB | ~1835개 |

## CLI 대화 파일 구조 (실측)

### Claude Code JSONL
```json
{"parentUuid":"...","sessionId":"...","type":"user|assistant|progress|file-history-snapshot",
 "message":{"role":"user|assistant","content":[...]},
 "uuid":"...","timestamp":"ISO8601","cwd":"...","version":1}
```
- type: user, assistant → 대화 메시지 / progress, file-history-snapshot → 스킵
- content: string 또는 array (tool_use, tool_result 포함)

### Codex JSONL
```json
{"timestamp":"ISO8601","type":"session_meta|response_item|event_msg|turn_context",
 "payload":{...}}
```
- session_meta: id, cwd, model_provider 등
- response_item: role(user/assistant), content
- turn_context: model, cwd 등
- event_msg: 내부 이벤트 → 스킵

### Gemini CLI JSON
```json
{"sessionId":"uuid","projectHash":"...","startTime":"ISO8601","lastUpdated":"ISO8601",
 "messages":[{"id":"...","timestamp":"ISO8601","type":"user|gemini","content":"str|list",
              "displayContent":"..."}]}
```
- type: user → 사용자, gemini → AI 응답
- content: string(응답) 또는 list[{"text":"..."}](입력)

---

## 섹션 구성

### 섹션 1: DB 마이그레이션
- 파일: `supabase/migrations/007_ai_conversations.sql`
- 테이블 3개: ai_conversations, ai_messages, ai_usage
- 인덱스 + RLS 정책
- Supabase SQL Editor에서 실행

### 섹션 2: CLI 파서 모듈
- 파일: `scripts/collectors/__init__.py`, `claude_code.py`, `codex_cli.py`, `gemini_cli.py`
- 공통 데이터 클래스 + 각 CLI별 파서
- 대형 파일(>5MB): 최근 200 + 처음 10 메시지만
- content 10KB 제한, tool_result는 요약만

### 섹션 3: Collector 데몬
- 파일: `scripts/collect_conversations.py`
- systemd: `~/.config/systemd/user/secretary-collector.service`, `.timer`
- 10분 주기 동기화, source_size 기반 변경 감지
- 배치 처리 (10개씩), fcntl 락

### 섹션 4: API 엔드포인트
- 파일: `src/app/api/conversations/route.ts`, `[id]/route.ts`
- GET /api/conversations: 목록 조회 (페이지네이션, 필터링)
- GET /api/conversations/[id]: 상세 + 메시지

### 섹션 5: E2E 검증
- DB 테이블 확인, 수집 실행, API 호출 테스트
- systemd 등록, 중복 방지 확인
- Codex + Gemini 코드 리뷰

## 재사용할 기존 코드
- `bot/config.py`: SUPABASE_REST_URL, SUPABASE_HEADERS
- `bot/supabase_client.py`: httpx _request() 패턴
- `src/lib/supabase-admin.ts`: Supabase SDK 클라이언트
- `src/app/api/history/route.ts`: API 패턴 (페이지네이션)
- `deploy/*.service`: systemd 서비스 패턴

## 예상 문제점 & 해결
1. **대형 파일 메모리 폭발** → 스트리밍 파서 (한 줄씩 읽기) + 메시지 수 제한
2. **DB 용량 폭증** → content 10KB 제한, tool_result 요약만
3. **첫 실행 시 779MB** → 10개씩 배치 + 비동기 처리
4. **UPSERT 충돌** → ON CONFLICT (provider, external_id) DO UPDATE
5. **Gemini projectHash→경로 매핑 불가** → history/ 의 .project_root에서 매핑 시도, 실패 시 hash 그대로 저장
6. **Supabase REST 요청 크기 제한** → 메시지 100개씩 분할 INSERT
