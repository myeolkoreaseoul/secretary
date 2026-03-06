# work-log-pipeline 맥락 노트

## 설계 결정
- [2026-03-05] 세션 요약을 JSONL로 누적 저장 → DB가 아닌 파일 기반. 이유: pre-compact 훅은 Supabase 의존 없이 동작해야 함 (네트워크 없이도 로컬 저장 가능)
- [2026-03-05] work-logs/{date}.jsonl 포맷 → 날짜별 파일 분리. 이유: 파일 크기 관리 + 날짜별 조회 용이
- [2026-03-05] aggregate 스크립트를 별도로 분리 → pre-compact 훅에서 DB 직접 저장 안 함. 이유: 훅은 가볍고 빨라야 함 (30초 타임아웃), DB 저장은 별도 스케줄
- [2026-03-05] Notion 동기화는 evening_review 후 실행. 이유: review까지 완성된 데이터를 한 번에 올림

## 발견사항
- [2026-03-05] pre-compact 훅이 latest.md만 덮어쓰기 → 하루 여러 세션이면 이전 요약 유실
- [2026-03-05] daily_reports_v2.stats는 JSONB spread merge 패턴 사용 (기존 필드 보존하며 부분 업데이트)
- [2026-03-05] evening_review.py는 아직 Phase 3 미완성 상태일 수 있음 → 섹션 3에서 현재 상태 확인 필요
- [2026-03-05] todos 테이블에 estimated_minutes, time_hint 필드 누락 가능성 (스키마 불일치)
- [2026-03-05] 동시 실행 시 stats JSONB last-write-wins 문제 → 실행 순서 보장 필요 (타이머 시간 간격)

## 관련 파일
- `~/.claude/hooks/custom/pre-compact.mjs` : 세션 요약 생성 훅
- `~/.claude/handover/latest.md` : 현재 handover 저장소
- `scripts/morning_plan.py` : enqueue 패턴 참조
- `scripts/evening_review.py` : 리뷰 생성 (수정 대상)
- `scripts/generate_timeline.py` : activity → timeline 변환
- `bot/supabase_client.py` : DB 함수 (upsert_daily_report_v2 등)
- `bot/mcp_server.py` : FIXED_BLOCKS, save 패턴 참조
