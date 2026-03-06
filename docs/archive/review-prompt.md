# AI Secretary v2 — 아키텍처 교차 검증 요청

당신은 시니어 소프트웨어 아키텍트입니다. 아래 구현 플랜과 기존 DB 스키마를 검토하고, **설계 결함, 모순, 누락, 잠재적 문제점**을 찾아주세요.

---

## 검증 포인트 (반드시 답변)

1. **SQL 스키마 충돌**: `002_chat_schema.sql`(기존)과 `003_v2_schema.sql`(신규) 사이에 충돌이나 중복이 있는가?
2. **함수 시그니처 정합성**: `telegram_bot.py`의 함수들과 `CLAUDE.md` 워크플로우 10단계가 일관되는가?
3. **아키텍처 모순**: 텔레그램 폴링(10초) + executor 타이머(1분) 조합에서 메시지 누락/지연 가능성은?
4. **파일 간 의존관계**: 8개 Python 파일의 import 관계에 순환 의존이나 누락이 있는가?
5. **보안 이슈**: `.env` 관리, Claude CLI `--dangerously-skip-permissions`, 텔레그램 화이트리스트에 취약점은?
6. **에러 핸들링 갭**: Gemini 임베딩 실패 → Fireworks 폴백 시 데이터 불일치 가능성은?
7. **동시성 문제**: `pending_messages.json` 파일 기반 메시지 전달에서 race condition은?
8. **웹 대시보드 vs 봇 데이터 정합성**: Python 봇이 쓰고 Next.js가 읽는 구조에서 문제점은?

---

## 기존 DB 스키마 (002_chat_schema.sql)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  message_count INTEGER DEFAULT 0
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  created_at TIMESTAMP DEFAULT NOW(),
  token_estimate INTEGER DEFAULT 0
);

ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
) RETURNS TABLE (
  id UUID, source_type TEXT, content TEXT,
  metadata JSONB, similarity FLOAT, created_at TIMESTAMP
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT cm.id, 'chat_message'::TEXT, cm.content, cm.metadata,
    1 - (cm.embedding <=> query_embedding) as similarity, cm.created_at
  FROM chat_messages cm WHERE cm.embedding IS NOT NULL
    AND 1 - (cm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT t.id, 'thought'::TEXT,
    COALESCE(t.title,'') || ': ' || COALESCE(t.summary,'') || ' | ' || COALESCE(t.advice,''),
    jsonb_build_object('raw_input', t.raw_input, 'category_id', t.category_id),
    1 - (t.embedding <=> query_embedding), t.created_at
  FROM thoughts t WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
END; $$;
```

## 신규 DB 스키마 (003_v2_schema.sql)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id BIGINT UNIQUE,
  chat_id BIGINT NOT NULL,
  sender VARCHAR(100),
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  media_type VARCHAR(20),
  media_path TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  category_id UUID REFERENCES categories(id),
  classification JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX telegram_messages_chat_idx ON telegram_messages(chat_id, created_at);
CREATE INDEX telegram_messages_category_idx ON telegram_messages(category_id);
CREATE INDEX telegram_messages_embedding_idx ON telegram_messages
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  window_title TEXT NOT NULL,
  app_name VARCHAR(200),
  category VARCHAR(100),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_logs_time_idx ON activity_logs(recorded_at);

CREATE TABLE hourly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  summary JSONB NOT NULL DEFAULT '{}',
  top_apps JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, hour)
);

CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  priority INTEGER DEFAULT 0,
  is_done BOOLEAN DEFAULT FALSE,
  due_date DATE,
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX todos_status_idx ON todos(is_done, priority DESC);

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  content TEXT,
  time_grid JSONB,
  stats JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 기존 테이블에 embedding 컬럼 (002에서 이미 추가됨, IF NOT EXISTS로 안전)
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 통합 벡터 검색 함수 (002의 함수를 확장, telegram_messages 추가)
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.25,
  match_count INT DEFAULT 15
) RETURNS TABLE (
  id UUID, source_type TEXT, content TEXT,
  metadata JSONB, similarity FLOAT, created_at TIMESTAMP
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT tm.id, 'telegram'::TEXT, tm.content, tm.metadata,
    1 - (tm.embedding <=> query_embedding) as similarity, tm.created_at
  FROM telegram_messages tm WHERE tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  SELECT t.id, 'thought'::TEXT,
    COALESCE(t.title,'') || ': ' || COALESCE(t.summary,'') || ' | ' || COALESCE(t.advice,''),
    jsonb_build_object('raw_input', t.raw_input, 'category_id', t.category_id),
    1 - (t.embedding <=> query_embedding), t.created_at
  FROM thoughts t WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC LIMIT match_count;
END; $$;
```

## 핵심 아키텍처

```
텔레그램 메시지 → telegram_listener.py (10초 폴링, 상시 실행)
    ↓ pending_messages.json에 저장
quick_check.py (0.1초) → 메시지 없으면 종료
    ↓ 있으면
executor.sh (flock 동시실행 방지) → claude -p -c --dangerously-skip-permissions --append-system-prompt-file CLAUDE.md
    ↓
Claude CLI가 Python 함수 호출:
  1. check_telegram() → 메시지 확인
  2. combine_messages() → 연속 메시지 병합
  3. create_working_lock()
  4. get_recent_history(chat_id, hours=24)
  5. get_relevant_context(message) → 임베딩+벡터검색
  6. 답변 생성 (자연어)
  7. report_telegram(chat_id, response) → 텔레그램 전송
  8. classify_message(content, response) → 분류 JSON
  9. save_classification(msg_id, json) → DB 저장
  10. release_working_lock()
```

## Python 파일 의존 관계 (계획)

```
telegram_listener.py → telegram_sender.py, supabase_client.py
telegram_sender.py   → (독립, python-telegram-bot만 사용)
telegram_bot.py      → telegram_sender.py, supabase_client.py, embedding.py
supabase_client.py   → (독립, httpx만 사용)
embedding.py         → (독립, httpx만 사용)
quick_check.py       → (독립, json만 사용)
executor.sh          → quick_check.py, Claude CLI
CLAUDE.md            → telegram_bot.py 함수 레퍼런스
```

## 기존 카테고리 (001_initial_schema.sql에서 시드)

업무, 소개팅비즈니스, 온라인판매, 건강, 가족, 개발, 기타

## 핵심 원칙

- 모든 판단 = Claude CLI만 (Max 구독 무제한)
- Gemini = 임베딩(숫자 변환) 전용
- 종량제 비용 $0
- python-telegram-bot 21.x 비동기 폴링
- systemd로 프로세스 관리

---

**한국어로 답변해주세요. 각 검증 포인트에 대해 구체적으로 답변하고, 발견한 문제마다 심각도(🔴 높음 / 🟡 중간 / 🟢 낮음)를 표시하세요.**
