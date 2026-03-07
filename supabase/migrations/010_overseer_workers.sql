-- 010_overseer_workers.sql: Worker tracking + project stage columns

-- 1. 워커 스냅샷 테이블
CREATE TABLE IF NOT EXISTS overseer_worker_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     TEXT NOT NULL,                  -- 유니크 키: claude_code:{sessionId}, telegram_bot, codex_cli:{sessionId}
  worker_type   TEXT NOT NULL                   -- claude_code, telegram_bot, codex_cli, gemini_cli
                CHECK (worker_type IN ('claude_code','telegram_bot','codex_cli','gemini_cli')),
  machine       TEXT,                           -- vivobook_wsl, macbook_pro 등
  session_id    TEXT,                           -- 세션 ID
  project_id    UUID REFERENCES overseer_projects(id) ON DELETE SET NULL,
  project_path  TEXT,                           -- 원본 경로 (매핑 안 될 때 표시용)
  status        TEXT NOT NULL DEFAULT 'offline' -- active, idle, offline
                CHECK (status IN ('active','idle','offline')),
  current_task  TEXT,                           -- 현재 작업 요약
  task_detail   JSONB DEFAULT '[]',             -- 전체 태스크 목록
  last_activity TIMESTAMPTZ,                    -- 마지막 활동 시각
  scanned_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_snap_scanned
  ON overseer_worker_snapshots(scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_snap_project
  ON overseer_worker_snapshots(project_id, scanned_at DESC);

-- 2. 프로젝트 테이블에 작업 단계 컬럼 추가
ALTER TABLE overseer_projects
  ADD COLUMN IF NOT EXISTS current_stage TEXT,
  ADD COLUMN IF NOT EXISTS stage_detail TEXT,
  ADD COLUMN IF NOT EXISTS stage_updated TIMESTAMPTZ;

-- 3. VIEW 재생성 (current_stage 포함) — DROP 필요 (컬럼 변경 시)
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
  p.current_stage,
  p.stage_detail,
  p.stage_updated,
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
  s.scanned_at    AS svc_scanned,
  -- active workers count (최근 5분)
  COALESCE(w.active_workers, 0) AS active_workers
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
) s ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS active_workers
  FROM overseer_worker_snapshots ws
  WHERE ws.project_id = p.id
    AND ws.status = 'active'
    AND ws.scanned_at > now() - interval '5 minutes'
) w ON true;

-- 4. RLS
ALTER TABLE overseer_worker_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON overseer_worker_snapshots FOR ALL USING (true) WITH CHECK (true);

-- 5. 7일 이상 된 워커 스냅샷 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_worker_snapshots()
RETURNS void AS $$
BEGIN
  DELETE FROM overseer_worker_snapshots
  WHERE scanned_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;
