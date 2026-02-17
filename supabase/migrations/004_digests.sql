-- AI Digest 테이블
CREATE TABLE IF NOT EXISTS digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('morning', 'evening')),
  videos JSONB NOT NULL DEFAULT '[]',
  header TEXT,
  video_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(digest_date, mode)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_digests_date ON digests(digest_date DESC);
