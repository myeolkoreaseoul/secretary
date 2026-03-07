-- 009: overseer_projects에 parent_id + auto_discovered 컬럼 추가

-- 하위 프로젝트 지원
ALTER TABLE overseer_projects
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES overseer_projects(id) ON DELETE SET NULL;

-- 자동 감지 여부
ALTER TABLE overseer_projects
  ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT false;

-- 카테고리 (Notion 라우팅용)
ALTER TABLE overseer_projects
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_overseer_parent
  ON overseer_projects(parent_id);

-- VIEW 재생성 (parent_id 포함) — 컬럼 순서 변경이므로 DROP 필요
DROP VIEW IF EXISTS overseer_project_summary;
CREATE VIEW overseer_project_summary AS
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
  p.parent_id,
  p.auto_discovered,
  p.category,
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
