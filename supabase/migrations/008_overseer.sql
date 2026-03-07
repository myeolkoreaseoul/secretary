-- 008_overseer.sql: Project Overseer tables
-- 프로젝트 총괄 모듈 — 5 tables + 1 view

-- 1. 프로젝트 레지스트리
CREATE TABLE IF NOT EXISTS overseer_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  path          TEXT NOT NULL,
  github_repo   TEXT,
  notion_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','paused','archived')),
  description   TEXT,
  tags          TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Git 스냅샷 시계열
CREATE TABLE IF NOT EXISTS overseer_git_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES overseer_projects(id) ON DELETE CASCADE,
  branch        TEXT NOT NULL DEFAULT 'main',
  commit_hash   TEXT,
  commit_msg    TEXT,
  commit_date   TIMESTAMPTZ,
  unpushed      INT DEFAULT 0,
  uncommitted   INT DEFAULT 0,
  untracked     INT DEFAULT 0,
  stale_branches INT DEFAULT 0,
  branch_list   JSONB DEFAULT '[]',
  scanned_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_git_snap_project
  ON overseer_git_snapshots(project_id, scanned_at DESC);

-- 3. FS 스냅샷 시계열
CREATE TABLE IF NOT EXISTS overseer_fs_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES overseer_projects(id) ON DELETE CASCADE,
  total_size_mb NUMERIC(10,2) DEFAULT 0,
  node_modules_mb NUMERIC(10,2) DEFAULT 0,
  junk_mb       NUMERIC(10,2) DEFAULT 0,
  junk_files    JSONB DEFAULT '[]',
  file_count    INT DEFAULT 0,
  dir_count     INT DEFAULT 0,
  largest_files JSONB DEFAULT '[]',
  scanned_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fs_snap_project
  ON overseer_fs_snapshots(project_id, scanned_at DESC);

-- 4. 서비스 스냅샷
CREATE TABLE IF NOT EXISTS overseer_service_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES overseer_projects(id) ON DELETE CASCADE,
  pm2_status    TEXT,
  pm2_name      TEXT,
  port          INT,
  port_open     BOOLEAN DEFAULT false,
  tunnel_url    TEXT,
  tunnel_alive  BOOLEAN DEFAULT false,
  extras        JSONB DEFAULT '{}',
  scanned_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_svc_snap_project
  ON overseer_service_snapshots(project_id, scanned_at DESC);

-- 5. 액션 실행 로그
CREATE TABLE IF NOT EXISTS overseer_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES overseer_projects(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL
                CHECK (action_type IN ('delete_junk','prune_branches','archive','custom')),
  dry_run       BOOLEAN DEFAULT true,
  payload       JSONB DEFAULT '{}',
  result        JSONB DEFAULT '{}',
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

-- 6. 프로젝트 요약 VIEW (최신 스냅샷 JOIN)
CREATE OR REPLACE VIEW overseer_project_summary AS
SELECT
  p.id,
  p.name,
  p.path,
  p.github_repo,
  p.notion_id,
  p.status,
  p.description,
  p.tags,
  p.updated_at,
  -- git
  g.branch        AS git_branch,
  g.commit_hash   AS git_commit,
  g.commit_msg    AS git_msg,
  g.commit_date   AS git_date,
  g.unpushed      AS git_unpushed,
  g.uncommitted   AS git_uncommitted,
  g.untracked     AS git_untracked,
  g.stale_branches AS git_stale,
  g.scanned_at    AS git_scanned,
  -- fs
  f.total_size_mb,
  f.node_modules_mb,
  f.junk_mb,
  f.file_count,
  f.scanned_at    AS fs_scanned,
  -- service
  s.pm2_status,
  s.pm2_name,
  s.port,
  s.port_open,
  s.tunnel_url,
  s.tunnel_alive,
  s.scanned_at    AS svc_scanned
FROM overseer_projects p
LEFT JOIN LATERAL (
  SELECT * FROM overseer_git_snapshots
  WHERE project_id = p.id ORDER BY scanned_at DESC LIMIT 1
) g ON true
LEFT JOIN LATERAL (
  SELECT * FROM overseer_fs_snapshots
  WHERE project_id = p.id ORDER BY scanned_at DESC LIMIT 1
) f ON true
LEFT JOIN LATERAL (
  SELECT * FROM overseer_service_snapshots
  WHERE project_id = p.id ORDER BY scanned_at DESC LIMIT 1
) s ON true;

-- RLS (service_role bypasses, but define policies for safety)
ALTER TABLE overseer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE overseer_git_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE overseer_fs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE overseer_service_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE overseer_actions ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "service_role_all" ON overseer_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON overseer_git_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON overseer_fs_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON overseer_service_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON overseer_actions FOR ALL USING (true) WITH CHECK (true);
