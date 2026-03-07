-- REPLICA IDENTITY FULL: UPDATE/DELETE 시 전체 행 데이터 포함
ALTER TABLE telegram_messages REPLICA IDENTITY FULL;
ALTER TABLE todos REPLICA IDENTITY FULL;

-- anon SELECT 정책 (개인 앱, 읽기 전용)
CREATE POLICY "anon_select" ON telegram_messages FOR SELECT USING (true);
CREATE POLICY "anon_select" ON categories FOR SELECT USING (true);
CREATE POLICY "anon_select" ON todos FOR SELECT USING (true);

-- Realtime publication 등록
ALTER PUBLICATION supabase_realtime ADD TABLE telegram_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
