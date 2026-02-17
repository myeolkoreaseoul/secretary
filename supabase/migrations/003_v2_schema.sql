-- 003_v2_schema.sql
-- AI Secretary v2: 텔레그램 봇 + 시간 추적 + 할일
-- 모든 타임스탬프는 TIMESTAMPTZ (타임존 포함)

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

-- 2. 텔레그램 메시지 (처리 완료된 메시지 영구 보관)
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

-- 3. 활동 추적 (Windows PowerShell에서 기록)
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

-- 6. Daily Report v2 (기존 daily_reports와 별도)
CREATE TABLE daily_reports_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  content TEXT,
  time_grid JSONB,
  stats JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 통합 벡터 검색 함수 (모든 소스 포함 — 002 함수 확장)
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
    (1 - (tm.embedding <=> query_embedding))::FLOAT as similarity,
    tm.created_at
  FROM telegram_messages tm
  WHERE tm.embedding IS NOT NULL
    AND 1 - (tm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  -- 기존 채팅 메시지 (002 레거시)
  SELECT cm.id, 'chat_message'::TEXT, cm.content, cm.metadata,
    (1 - (cm.embedding <=> query_embedding))::FLOAT as similarity,
    cm.created_at
  FROM chat_messages cm
  WHERE cm.embedding IS NOT NULL
    AND 1 - (cm.embedding <=> query_embedding) > match_threshold
  UNION ALL
  -- 기존 생각 분리수거
  SELECT t.id, 'thought'::TEXT,
    COALESCE(t.title, '') || ': ' || COALESCE(t.summary, '') || ' | ' || COALESCE(t.advice, ''),
    jsonb_build_object('raw_input', t.raw_input, 'category_id', t.category_id),
    (1 - (t.embedding <=> query_embedding))::FLOAT,
    t.created_at
  FROM thoughts t
  WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END; $$;

-- 8. 큐 알림 함수 (LISTEN/NOTIFY로 worker에 즉시 신호)
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('new_message', NEW.id::TEXT);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_message_queue_insert
  AFTER INSERT ON message_queue FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();
