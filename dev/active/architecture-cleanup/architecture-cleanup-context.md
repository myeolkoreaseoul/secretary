# architecture-cleanup 맥락 노트

## 설계 결정
- [2026-03-04] 구 데이터 모델(thoughts/conversations/employees) 기반 코드 전부 삭제 → 현재 시스템은 telegram_messages 중심으로 완전 전환됨
- [2026-03-04] lib/supabase.ts (anon key) 삭제, supabase-admin.ts (service role)만 유지 → 구 API만 anon 사용했음
- [2026-03-04] lib/claude.ts 삭제 → callClaude 함수가 어디서도 import되지 않음. chat/daily-plan은 직접 Anthropic SDK 사용

## 발견사항
- [2026-03-04] Supabase 클라이언트 2종 혼용: 구 API 4개는 anon key, 신규 API 전부는 service role
- [2026-03-04] CommandPalette PAGES 배열에 플래너/다이제스트/유튜브 누락 (layout.tsx navItems와 불일치)
- [2026-03-04] 카테고리 목록이 5곳에 하드코딩 (DailyPlanEditor, ManualTimeForm, TimerWidget, TodosPage, SearchBar)
- [2026-03-04] getToday() 날짜 함수가 4곳에 인라인 중복
- [2026-03-04] 사이드바에 active 링크 하이라이트 없음 (usePathname 미사용)
- [2026-03-04] /categories vs /history: 동일 데이터소스(telegram_messages)지만 뷰 방식이 다름 (카테고리별 그룹 vs 시간순). 현재는 유지.

## 실행 기록
- [2026-03-04] 섹션 2(카테고리→대화 통합): /history에 카테고리 탭 추가 (API는 이미 category param 지원). /categories 페이지+클라이언트 삭제. /api/categories는 설정페이지+탭 fetch용으로 유지.
- [2026-03-04] 섹션 1+2 완료: 17개 파일 삭제 + types/index.ts에서 13개 구 타입 제거. Employee, Thought, Conversation, DailyReport(V1), MessageQueue, ThoughtRequest/Response, ThoughtResultItem, ConversationRequest/Response, SearchResult/Response, ReportResponse, ClassifierItem/Response 삭제. `npm run build` 성공.

## 관련 파일
- `src/app/layout.tsx` : 사이드바 navItems 정의 (34-44행)
- `src/components/CommandPalette.tsx` : PAGES 배열 (17-24행)
- `src/components/ClientProviders.tsx` : 글로벌 클라이언트 래퍼
- `src/types/index.ts` : 전체 타입 정의
- `src/lib/api-client.ts` : apiFetch 래퍼 (유지)
- `src/lib/supabase-admin.ts` : service role 클라이언트 (유지)
- `src/lib/gemini.ts` : streamGemini - YT 챗에서 사용 (유지)
- `src/lib/utils.ts` : cn() 함수 (유지, getToday 추가 예정)
