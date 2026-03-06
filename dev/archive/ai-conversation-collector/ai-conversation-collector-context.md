# AI Conversation Collector - Context (발견사항)

## 탐색 결과

### 프로젝트 구조
- Next.js 프론트엔드 + Python 봇 백엔드
- Supabase 마이그레이션: 001~006 존재, 007번 사용 가능
- scripts/ 에 다수의 배치 스크립트 존재 (collect_scout, collect_youtube 등)
- deploy/ 에 systemd 서비스 패턴 (listener, worker)

### CLI 대화 파일 실측 데이터
- Claude Code: 780MB, ~/.claude/projects/ 하위, type=user|assistant 만 대화
- Codex: 31MB, ~/.codex/sessions/YYYY/MM/DD/, type=session_meta|response_item 핵심
- Gemini: 68MB, ~/.gemini/tmp/{projectHash}/chats/, 1835개 JSON 파일
- Gemini history/는 .project_root 파일만 존재 (대화 파일 없음)
- Gemini 대화 파일은 tmp/ 하위에 projectHash 디렉토리별로 존재

### 기존 패턴 (재사용)
- bot/config.py: require_env(), SUPABASE_REST_URL, SUPABASE_HEADERS
- bot/supabase_client.py: httpx AsyncClient 싱글톤, _request(method, path, ...)
- src/lib/supabase-admin.ts: createClient with service_role key
- src/app/api/history/route.ts: supabaseAdmin 사용, offset/limit 페이지네이션
- deploy/*.service: systemd 패턴 (User=john, EnvironmentFile, ReadWritePaths)

### 주의사항
- Claude Code JSONL: progress, file-history-snapshot type은 비대화 → 필터링 필요
- Codex: event_msg type은 내부 이벤트 → 스킵
- Gemini: content가 string(응답) 또는 list[{text:...}](입력) → 타입 분기 필요
- Gemini: projectHash→프로젝트 경로 매핑 → history/{name}/.project_root 파일로 시도
