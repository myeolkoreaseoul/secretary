-- pgvector 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- chat_sessions: 대화 세션
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  message_count INTEGER DEFAULT 0
);

-- chat_messages: 개별 메시지 (핵심 테이블)
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

-- 인덱스
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, created_at);
CREATE INDEX chat_messages_embedding_idx ON chat_messages
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 기존 테이블에 embedding 컬럼 추가
ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 벡터 유사도 검색 함수
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

-- 세션 메시지 카운트 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_session_message_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_sessions SET message_count = message_count + 1,
    updated_at = NOW() WHERE id = NEW.session_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON chat_messages FOR EACH ROW
  EXECUTE FUNCTION update_session_message_count();
