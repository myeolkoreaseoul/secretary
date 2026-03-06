-- 007_ai_conversations.sql
-- AI CLI 대화 통합 저장을 위한 스키마
-- Claude Code, Codex CLI, Gemini CLI 대화를 수집하여 통합 관리

-- ============================================================
-- ai_conversations: 세션(대화) 단위
-- ============================================================

CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,          -- 'claude_code', 'codex', 'gemini_cli', 'telegram', 'web'
  external_id TEXT,                        -- 원본 세션 ID (Claude sessionId, Codex session_id 등)
  project_path TEXT,                       -- 프로젝트 경로
  title TEXT,                              -- 대화 제목 (첫 메시지 요약)
  model VARCHAR(100),                      -- 주 모델
  started_at TIMESTAMPTZ NOT NULL,         -- 첫 메시지 타임스탬프
  ended_at TIMESTAMPTZ,                    -- 마지막 메시지 타임스탬프
  message_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',             -- 프로바이더별 추가 데이터
  source_path TEXT,                        -- 원본 파일 경로
  source_size BIGINT,                      -- 원본 파일 크기 (변경 감지용)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, external_id)
);

-- ============================================================
-- ai_messages: 개별 메시지 (turn)
-- ============================================================

CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,               -- 'user', 'assistant', 'system', 'tool'
  content TEXT,                            -- 메시지 내용 (10KB 제한은 앱 레벨)
  token_count INTEGER,
  model VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  message_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ai_usage: 토큰/비용 추적
-- ============================================================

CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,6),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX idx_ai_conversations_provider ON ai_conversations(provider);
CREATE INDEX idx_ai_conversations_started_at ON ai_conversations(started_at DESC);
CREATE INDEX idx_ai_conversations_project_path ON ai_conversations(project_path);

CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_message_at ON ai_messages(message_at);
CREATE INDEX idx_ai_messages_conv_at ON ai_messages(conversation_id, message_at);
CREATE INDEX idx_ai_messages_role ON ai_messages(role);

CREATE INDEX idx_ai_usage_conversation_id ON ai_usage(conversation_id);
CREATE INDEX idx_ai_usage_provider ON ai_usage(provider);
CREATE INDEX idx_ai_usage_recorded_at ON ai_usage(recorded_at DESC);

-- ============================================================
-- RLS (service_role bypasses automatically, anon denied)
-- ============================================================

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
