-- 005_enable_rls.sql
-- Enable Row Level Security on all tables and restrict access to service_role only.
-- anon key users will have NO access to any table.
-- Bot and API routes use service_role key, which bypasses RLS.

-- ============================================================
-- V2 Schema tables (actively used by bot + web dashboard)
-- ============================================================

ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports_v2 ENABLE ROW LEVEL SECURITY;

-- Policies: service_role bypasses RLS automatically.
-- These policies explicitly deny all access via anon key.
-- (No SELECT/INSERT/UPDATE/DELETE policies = no access for anon)

-- ============================================================
-- V1 Schema tables (legacy, still referenced)
-- ============================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Chat Schema tables
-- ============================================================

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Digests table
-- ============================================================

ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
