# AI Secretary v2 — 최종 구현 플랜 (수정판)

> 작성: 2026-02-16
> 3-AI 교차 검증 반영 (Claude + Codex + Gemini)
> 원칙: 안정성 최우선, 업계 표준, 판매 가능 수준

---

## 아키텍처 개요

```
텔레그램 메시지
    ↓
telegram_listener.py (비동기 핸들러, 상시 실행)
    ↓ Supabase message_queue 테이블에 INSERT
    ↓ pg_notify('new_message') 신호
worker.py (상시 실행, LISTEN/NOTIFY + 폴링 폴백)
    ↓ SELECT ... FOR UPDATE SKIP LOCKED
    ↓ status: pending → processing
claude -p --mcp-config mcp.json --append-system-prompt-file CLAUDE.md "프롬프트"
    ↓ Claude가 MCP 프로토콜로 Python 함수 호출
    ↓ 1. get_recent_history() → 24시간 컨텍스트
    ↓ 2. get_relevant_context() → 벡터 검색
    ↓ 3. send_telegram_message() → 답변 전송
    ↓ 4. classify_and_save() → 분류 + DB 저장
    ↓ 5. generate_embedding() → 임베딩 저장
    ↓ status: processing → done
웹 대시보드 (Next.js): 카테고리별 관리, 시간 그리드, 할일
```

### 기존 플랜 대비 변경 사항

| 항목 | 기존 (소놀봇 카피) | 변경 (업계 표준) |
|------|-------------------|-----------------|
| 메시지 전달 | pending_messages.json | PostgreSQL 큐 테이블 |
| Claude 도구 호출 | --dangerously-skip-permissions + bash | MCP Server (JSON-RPC) |
| 프로세스 수 | 3개 (listener+timer+executor) | 2개 (listener+worker) |
| 응답 지연 | 60~70초 | 20~30초 |
| 임베딩 폴백 | Gemini→Fireworks 자동전환 | Gemini 단일 + 재시도 + NULL |
| 타임스탬프 | TIMESTAMP | TIMESTAMPTZ |
| 테스트 | 없음 | pytest + vitest |
| 보안 | 플래그로 전부 열기 | MCP로 함수 단위 제어 |
| 로깅 | 없음 | 구조화 로깅 (Python logging) |

---

## 사전 준비 (사용자가 Supabase SQL Editor에서 실행)

### `supabase/migrations/003_v2_schema.sql`

```sql
-- 1. 메시지 큐 (listener → worker 안전한 전달)
CREATE TABLE message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  telegram_message_id BIGINT,
  sender VARCHAR(100),
  content TEXT NOT NULL,
  media_type VARCHAR(20),
  media_path TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(chat_id, telegram_message_id)
);

CREATE INDEX message_queue_status_idx ON message_queue(status, created_at);

-- 2. 텔레그램 메시지 저장 (처리 완료된 메시지 영구 보관)
CREATE TABLE telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id BIGINT,
  chat_id BIGINT NOT NULL,
  sender VARCHAR(100),
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  media_type VARCHAR(20),
  media_path TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  embedding_model VARCHAR(50),
  category_id UUID REFERENCES categories(id),
  classification JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chat_id, telegram_message_id)
);

CREATE INDEX telegram_messages_chat_idx ON telegram_messages(chat_id, created_at);
CREATE INDEX telegram_messages_category_idx ON telegram_messages(category_id);
CREATE INDEX telegram_messages_embedding_idx ON telegram_messages
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 3. 활동 추적
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_title TEXT NOT NULL,
  app_name VARCHAR(200),
  category VARCHAR(100),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_logs_time_idx ON activity_logs(recorded_at);

-- 4. 시간별 집계
CREATE TABLE hourly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  summary JSONB NOT NULL DEFAULT '{}',
  top_apps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, hour)
);

-- 5. 할일
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  priority INTEGER DEFAULT 0,
  is_done BOOLEAN DEFAULT FALSE,
  due_date DATE,
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX todos_status_idx ON todos(is_done, priority DESC);

-- 6. Daily Report (기존 테이블 확장)
CREATE TABLE IF NOT EXISTS daily_reports_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  content TEXT,
  time_grid JSONB,
  stats JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 통합 벡터 검색 함수 (모든 소스 포함)
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.25,
  match_count INT DEFAULT 15
) RETURNS TABLE (
  id UUID, source_type TEXT, content TEXT,
  metadata JSONB, similarity FLOAT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  -- 텔레그램 메시지
  SELECT tm.id, 'telegram'::TEXT, tm.content, tm.metadata,
    1 - (tm.embedding <=> query_embedding) as similarity, tm.created_at
  FROM telegram_messages tm WHERE tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  -- 기존 채팅 메시지 (002 레거시)
  SELECT cm.id, 'chat_message'::TEXT, cm.content, cm.metadata,
    1 - (cm.embedding <=> query_embedding) as similarity, cm.created_at
  FROM chat_messages cm WHERE cm.embedding IS NOT NULL
    AND 1 - (cm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  -- 기존 생각 분리수거
  SELECT t.id, 'thought'::TEXT,
    COALESCE(t.title,'') || ': ' || COALESCE(t.summary,'') || ' | ' || COALESCE(t.advice,''),
    jsonb_build_object('raw_input', t.raw_input, 'category_id', t.category_id),
    1 - (t.embedding <=> query_embedding), t.created_at
  FROM thoughts t WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
END; $$;

-- 8. 큐 알림 함수 (LISTEN/NOTIFY)
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('new_message', NEW.id::TEXT);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_message_queue_insert
  AFTER INSERT ON message_queue FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();
```

---

## Phase 1A: 텔레그램 봇 + Claude CLI (핵심)

### 파일 구조

```
bot/
├── __init__.py
├── config.py              # 중앙 설정/환경변수 로딩
├── telegram_listener.py   # 텔레그램 폴링 → DB 큐
├── worker.py              # DB 큐 감시 → Claude CLI 실행
├── mcp_server.py          # MCP 서버 (Claude가 호출하는 도구)
├── telegram_sender.py     # 텔레그램 메시지 전송
├── supabase_client.py     # Supabase REST API
├── embedding.py           # Gemini 임베딩 (단일 모델)
├── CLAUDE.md              # 시스템 프롬프트
├── mcp.json               # MCP 서버 설정
├── requirements.txt
├── .env                   # 환경변수 템플릿
└── tests/
    ├── __init__.py
    ├── test_supabase_client.py
    ├── test_embedding.py
    └── test_telegram_sender.py
```

### 1A-1. `bot/config.py` (~30줄)
- `python-dotenv`로 `.env` 로딩 (중앙 집중)
- 모든 환경변수를 상수로 export
- 다른 모든 파일이 이 파일에서 설정을 import
- 누락된 필수 변수 시 즉시 에러

### 1A-2. `bot/requirements.txt`
```
python-telegram-bot==21.10
python-dotenv==1.1.0
httpx==0.28.1
mcp==1.9.2
```

### 1A-3. `bot/.env` (템플릿)
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
GEMINI_API_KEY=
BOT_DIR=/home/john/projects/secretary/bot
LOG_LEVEL=INFO
```

### 1A-4. `bot/telegram_listener.py` (~120줄)
- python-telegram-bot 비동기 핸들러 (Application.run_polling)
- 메시지 수신 → chat_id 화이트리스트 검증 (immutable user_id 기반)
- DB message_queue 테이블에 INSERT
- 사진/문서/위치 첨부 처리
- 구조화 로깅 (logging 모듈)
- 에러 시 텔레그램으로 관리자에게 알림

### 1A-5. `bot/telegram_sender.py` (~80줄)
- `send_message(chat_id, text)` — 4096자 자동 분할
- `send_file(chat_id, file_path)` — 파일 전송
- `send_typing_action(chat_id)` — 타이핑 표시
- httpx 기반 (python-telegram-bot의 Bot 클래스 사용)

### 1A-6. `bot/supabase_client.py` (~150줄)
- httpx로 Supabase REST API 호출 (중앙 클라이언트)
- **큐 관련:**
  - `enqueue_message(chat_id, content, ...)` — 큐에 추가
  - `dequeue_message()` — FOR UPDATE SKIP LOCKED로 가져오기
  - `complete_message(queue_id)` — status → done
  - `fail_message(queue_id, error)` — status → failed
- **메시지 관련:**
  - `save_message(msg)` — telegram_messages 저장
  - `get_recent_messages(chat_id, hours)` — 최근 메시지 조회
  - `save_classification(msg_id: UUID, classification)` — 분류 저장
- **카테고리:**
  - `get_categories()` — 목록 조회
  - `upsert_category(name, color)` — 새 카테고리
- **벡터:**
  - `save_embedding(table, id, embedding, model)` — 임베딩 + 모델명 저장
  - `search_similar(embedding, threshold, count)` — RPC 호출
- **할일:**
  - `add_todo(title, category, due_date)` — 할일 추가
  - `list_todos(is_done)` — 할일 조회

### 1A-7. `bot/embedding.py` (~60줄)
- Gemini text-embedding-004 **단일 모델**
- 실패 시: 지수 백오프 재시도 3회 (1초, 2초, 4초)
- 3회 실패 시: None 반환 (caller가 NULL로 DB 저장)
- 2000자 자동 truncate
- 모델명 상수 export (DB에 함께 저장용)

### 1A-8. `bot/mcp_server.py` (~200줄)
Claude CLI가 연결하는 MCP 서버. 노출하는 도구(tools):

```python
@server.tool()
def get_recent_history(chat_id: int, hours: int = 24) -> str:
    """최근 N시간 대화 히스토리 조회"""

@server.tool()
def get_relevant_context(query: str) -> str:
    """벡터 검색으로 관련 과거 맥락 조회"""

@server.tool()
def send_telegram_message(chat_id: int, text: str) -> str:
    """텔레그램으로 답변 전송"""

@server.tool()
def classify_and_save(message_id: str, content: str, response: str) -> str:
    """메시지 분류 + DB 저장 (Claude가 분류 JSON 생성해서 전달)"""

@server.tool()
def get_categories() -> str:
    """현재 카테고리 목록 조회"""

@server.tool()
def add_todo(title: str, category: str = "", due_date: str = "") -> str:
    """할일 추가"""

@server.tool()
def save_user_message(chat_id: int, content: str, telegram_message_id: int = 0) -> str:
    """유저 메시지 DB 저장 + 임베딩 생성"""

@server.tool()
def save_bot_response(chat_id: int, content: str) -> str:
    """봇 응답 DB 저장 + 임베딩 생성"""
```

### 1A-9. `bot/mcp.json`
```json
{
  "mcpServers": {
    "secretary": {
      "command": "python3",
      "args": ["/home/john/projects/secretary/bot/mcp_server.py"]
    }
  }
}
```

### 1A-10. `bot/worker.py` (~150줄)
DB 큐를 감시하고 Claude CLI를 실행하는 워커.

```python
async def main():
    # 1. LISTEN 'new_message' (pg_notify)
    # 2. 폴링 폴백: 30초마다 pending 확인
    # 3. 메시지 발견 시:
    #    a. dequeue (FOR UPDATE SKIP LOCKED)
    #    b. status → processing
    #    c. flock으로 동시 실행 방지
    #    d. claude -p --mcp-config mcp.json \
    #         --append-system-prompt-file CLAUDE.md \
    #         "새 메시지: {content}"
    #    e. 성공 → complete_message()
    #    f. 실패 → fail_message() + 에러 로깅
    #    g. stale lock 감지 (10분 초과 시 강제 해제)
```

**폴백 전략**: MCP가 작동하지 않을 경우
```python
# --dangerously-skip-permissions로 폴백
claude -p -c --dangerously-skip-permissions \
  --append-system-prompt-file CLAUDE.md "프롬프트"
```

### 1A-11. `bot/CLAUDE.md` (~250줄)
- 페르소나: 개인 AI 비서 (한국어)
- **MCP 도구 사용 워크플로우:**
  1. `save_user_message()` → 유저 메시지 DB 저장
  2. `get_recent_history()` → 24시간 컨텍스트
  3. `get_relevant_context()` → 벡터 검색
  4. 답변 생성 (자연어)
  5. `send_telegram_message()` → 답변 전송
  6. `save_bot_response()` → 봇 응답 DB 저장
  7. `get_categories()` → 카테고리 목록 확인
  8. `classify_and_save()` → 분류 JSON 생성 + DB 저장
- **분류 규칙:**
  - 기존 카테고리 반드시 확인 후 사용
  - 정말 안 맞을 때만 새 카테고리 제안
  - JSON 포맷: `{category, title, summary, advice, entities[]}`
- **금지 사항:** 시스템 파일 삭제, .env 출력, rm -rf 등

### 1A-12. systemd 서비스 (2개)

`deploy/secretary-listener.service`:
```ini
[Unit]
Description=Secretary Telegram Listener
After=network.target

[Service]
Type=simple
User=john
WorkingDirectory=/home/john/projects/secretary
ExecStart=/usr/bin/python3 bot/telegram_listener.py
Restart=always
RestartSec=5
EnvironmentFile=/home/john/projects/secretary/bot/.env

[Install]
WantedBy=multi-user.target
```

`deploy/secretary-worker.service`:
```ini
[Unit]
Description=Secretary Message Worker
After=network.target

[Service]
Type=simple
User=john
WorkingDirectory=/home/john/projects/secretary
ExecStart=/usr/bin/python3 bot/worker.py
Restart=always
RestartSec=10
EnvironmentFile=/home/john/projects/secretary/bot/.env

[Install]
WantedBy=multi-user.target
```

---

## Phase 1B: 벡터 메모리 + 백필

### 1B-1. `scripts/backfill_embeddings.py` (~60줄)
- 기존 `thoughts` 테이블에서 embedding NULL 레코드 조회
- Gemini 임베딩 생성 (재시도 포함)
- DB 업데이트 + embedding_model 메타데이터
- 200ms 딜레이 (rate limit)
- 진행률 로깅

---

## Phase 1C: 웹 대시보드

### 초기 설정
```bash
npx shadcn@latest init   # New York, Zinc, dark mode
npx shadcn@latest add button input badge card separator tabs skeleton
```

### 파일 목록

| 파일 | 설명 |
|------|------|
| `src/lib/supabase-admin.ts` | service_role 서버사이드 클라이언트 |
| `src/lib/utils.ts` | cn() 유틸리티 |
| `src/types/index.ts` | 새 타입 추가 (TelegramMessage, Todo 등) |
| `src/app/layout.tsx` | 사이드바 + 다크모드 |
| `src/app/page.tsx` | /categories 리다이렉트 |
| `src/app/globals.css` | shadcn CSS 변수 |
| `src/app/categories/page.tsx` | 카테고리별 현황 (메인) |
| `src/app/history/page.tsx` | 대화 히스토리 타임라인 |
| `src/app/todos/page.tsx` | 할일 CRUD |
| `src/app/time/page.tsx` | 시간 추적 대시보드 |
| `src/app/settings/page.tsx` | 카테고리 관리 |
| `src/app/api/health/route.ts` | 헬스체크 엔드포인트 |
| `src/app/api/history/route.ts` | 히스토리 API |
| `src/app/api/todos/route.ts` | 할일 API |
| `src/app/api/time/route.ts` | 시간 API |
| `src/app/api/categories/[id]/route.ts` | 카테고리 수정/삭제 |
| `src/app/api/summary/route.ts` | AI 요약 |
| `src/components/TimeGrid.tsx` | 24시간 그리드 |

---

## Phase 1D: 시간 추적

| 파일 | 설명 |
|------|------|
| `scripts/activity_tracker.ps1` | Windows 활동 수집기 |
| `scripts/aggregate_hourly.py` | 시간별 집계 |
| `scripts/daily_report.py` | Daily Report 생성 |

---

## 수정 대상 기존 파일

| 파일 | 변경 |
|------|------|
| `.gitignore` | bot/.env, bot/logs/, *.lock 추가 |
| `.env.local` | SUPABASE_SERVICE_KEY 추가 |

---

## 구현 순서

1. SQL 마이그레이션 파일 작성
2. `bot/config.py` → `bot/supabase_client.py` → `bot/embedding.py` → `bot/telegram_sender.py` (독립 모듈)
3. `bot/mcp_server.py` (도구 서버)
4. `bot/telegram_listener.py` (수신)
5. `bot/worker.py` (처리)
6. `bot/CLAUDE.md` + `bot/mcp.json`
7. `bot/requirements.txt` + `bot/.env`
8. systemd 서비스 2개
9. `scripts/backfill_embeddings.py`
10. shadcn/ui 초기화 + 웹 대시보드
11. 시간 추적 스크립트

---

## 검증 방법

### Phase 1A
```bash
# 1. listener 실행
python3 bot/telegram_listener.py

# 2. 텔레그램에서 봇에게 메시지 전송

# 3. Supabase message_queue에 pending 레코드 확인

# 4. worker 실행
python3 bot/worker.py

# 5. 확인:
# - 텔레그램에 답변 수신
# - telegram_messages에 user+assistant 메시지 저장
# - classification JSONB 저장
# - embedding 벡터 저장 (embedding_model = 'text-embedding-004')
# - message_queue status = 'done'
```

### 테스트
```bash
cd bot && python -m pytest tests/ -v
```
