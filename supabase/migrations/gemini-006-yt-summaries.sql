-- 006_yt_summaries.sql
-- YouTube 영상 요약 및 자막 저장 테이블

CREATE TABLE IF NOT EXISTS yt_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id VARCHAR(20) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  channel TEXT,
  duration TEXT,
  thumbnail_url TEXT,
  summary_json JSONB DEFAULT '{}',
  sentences JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_yt_summaries_video_id ON yt_summaries(video_id);
CREATE INDEX IF NOT EXISTS idx_yt_summaries_created_at ON yt_summaries(created_at DESC);

-- RLS 설정
ALTER TABLE yt_summaries ENABLE ROW LEVEL SECURITY;

-- 서비스 롤은 모든 권한 허용 (익명 접근은 금지)
-- 005_enable_rls.sql 패턴을 따름
