# AI Conversation Collector - Tasks

## 섹션 1: DB 마이그레이션 ✅
- [x] ai_conversations 테이블 생성
- [x] ai_messages 테이블 생성
- [x] ai_usage 테이블 생성
- [x] 인덱스 생성 (provider, external_id, conversation_id, message_at)
- [x] RLS 정책 설정
- [x] Supabase Management API로 실행 확인

## 섹션 2: CLI 파서 모듈 ✅
- [x] `scripts/collectors/__init__.py` - 공통 데이터 클래스
- [x] `scripts/collectors/claude_code.py` - JSONL 파서 (906개 발견, 27/50 파싱 성공)
- [x] `scripts/collectors/codex_cli.py` - JSONL 파서 (100개 발견, 파싱 성공)
- [x] `scripts/collectors/gemini_cli.py` - JSON 파서 (1835개 발견, 파싱 성공)
- [x] 각 파서 단위 테스트 완료

## 섹션 3: Collector 데몬 ✅
- [x] `scripts/collect_conversations.py` - 동기화 스크립트
- [x] Supabase UPSERT 로직 (merge-duplicates)
- [x] 배치 처리 (10개씩)
- [x] fcntl 락
- [x] systemd service + timer 파일 생성
- [x] Codex 100개 수집 성공, Gemini/Claude 수집 진행 중

## 섹션 4: API 엔드포인트 ✅
- [x] `src/app/api/conversations/route.ts` - 목록 조회
- [x] `src/app/api/conversations/[id]/route.ts` - 상세 조회
- [x] Supabase 직접 쿼리로 검증 완료

## 섹션 5: E2E 검증 ✅
- [x] DB 테이블 3개 존재 확인
- [x] 수집 실행 → 2,068 대화 + 23,728 메시지 저장
- [x] API 쿼리 검증 (Supabase 직접)
- [x] systemd timer 등록 + active (10분 주기)
- [x] 중복 수집 방지 확인 (Codex 100개 전부 skipped)
- [x] Codex + Gemini 코드 리뷰 완료 → major 이슈 4건 수정
