-- Activity events: unified life tracking table
-- All data sources (coding, telegram, PC activity, location, payment, etc.)
-- get normalized into this single table.

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,          -- 'ai_coding', 'telegram', 'pc_activity', 'location', 'payment', ...
  category VARCHAR(50) NOT NULL,        -- 'coding', 'communication', 'sleep', 'transit', 'meal', 'exercise', ...
  title TEXT,
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  metadata JSONB DEFAULT '{}',          -- source-specific: {conversation_id, project_path, provider, ...}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_events_started ON activity_events(started_at DESC);
CREATE INDEX idx_activity_events_source ON activity_events(source);
CREATE INDEX idx_activity_events_category ON activity_events(category);
CREATE INDEX idx_activity_events_date ON activity_events(((started_at AT TIME ZONE 'Asia/Seoul')::date));

-- Prevent duplicate imports
CREATE UNIQUE INDEX idx_activity_events_source_ref
  ON activity_events(source, (metadata->>'ref_id'))
  WHERE metadata->>'ref_id' IS NOT NULL;
