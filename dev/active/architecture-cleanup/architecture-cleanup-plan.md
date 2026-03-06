# architecture-cleanup 계획

## 목적
Secretary 프로젝트 메뉴 9개 → 6개 재구성 + 죽은 코드 삭제 + UI 일관성 수정

---

## 섹션 목록

### 섹션 1: 죽은 코드 삭제 (17개 파일)
- **목적**: 구 데이터 모델(thoughts/conversations/employees) 기반 파일 일괄 삭제
- **삭제 파일**:
  - 페이지: `src/app/conversations/page.tsx`, `src/app/report/page.tsx`, `src/app/search/page.tsx`
  - API: `src/app/api/thought/route.ts`, `src/app/api/conversation/route.ts`, `src/app/api/report/route.ts`, `src/app/api/search/route.ts`, `src/app/api/summary/route.ts`
  - 컴포넌트: `src/components/ThoughtInput.tsx`, `src/components/ThoughtResult.tsx`, `src/components/SearchBar.tsx`, `src/components/ConversationCard.tsx`, `src/components/EmployeeBadge.tsx`, `src/components/CategoryBadge.tsx`
  - Lib: `src/lib/claude.ts`, `src/lib/groq.ts`, `src/lib/supabase.ts`, `src/lib/classifier.ts`
- **types/index.ts 정리**: Employee, Thought, Conversation, DailyReport(V1), MessageQueue, ThoughtRequest, ThoughtResponse, ThoughtResultItem, ConversationRequest, ConversationResponse, ReportResponse, ClassifierItem, ClassifierResponse 삭제
- **완료 기준**: `npm run build` 성공
- **의존**: 없음

### 섹션 2: 대화 페이지에 카테고리 필터 통합
- **목적**: `/categories` 삭제하고 `/history`에 카테고리 탭 추가
- **파일**:
  - 수정: `src/app/history/page.tsx` (카테고리 탭 추가)
  - 수정: `src/app/api/history/route.ts` (category 쿼리 파라미터 추가)
  - 삭제: `src/app/categories/page.tsx`, `src/app/categories/client.tsx`
- **구현**:
  - 상단에 카테고리 탭: [전체] [업무] [개발] [건강] [기타] [미분류]
  - `/api/categories`에서 목록 fetch → 탭 렌더링
  - 탭 클릭 → `category=카테고리id` 파라미터로 필터링
  - "전체" 탭 = 기존과 동일 (파라미터 없음)
  - 검색 + 페이지네이션은 카테고리 필터와 조합 가능
- **완료 기준**: 카테고리별 대화 필터링 동작 + `npm run build` 성공
- **의존**: 섹션 1 완료 후

### 섹션 3: 시간 페이지에 플래너+주간 탭 통합
- **목적**: `/planner` 삭제하고 `/time`에 3탭 구성 (기록/플래너/주간)
- **파일**:
  - 수정: `src/app/time/page.tsx` (Tabs 추가, 플래너/주간 탭 콘텐츠)
  - 삭제: `src/app/planner/page.tsx`
  - 유지: `src/components/WeeklyDashboard.tsx`, `src/app/api/planner/route.ts`, `src/app/api/daily-plan/route.ts`
- **구현**:
  - shadcn `Tabs`: "기록" | "플래너" | "주간"
  - **기록 탭**: 현재 /time 내용 그대로 (TimeGrid + DailyPlanEditor + ManualTimeForm + Report + Logs)
  - **플래너 탭**: /planner의 TimelineColumn + AdherenceColumn 코드 이동. 3칼럼 Plan vs Actual 비교 뷰.
  - **주간 탭**: WeeklyDashboard 컴포넌트 렌더링
  - 날짜 state를 탭 간 공유 (탭 전환해도 같은 날짜)
- **완료 기준**: 3개 탭 전환 동작 + Plan vs Actual 비교 뷰 정상 + `npm run build` 성공
- **의존**: 섹션 1 완료 후

### 섹션 4: 유튜브 페이지에 다이제스트 탭 통합
- **목적**: `/digest` 삭제하고 `/yt`에 2탭 구성 (영상/다이제스트)
- **파일**:
  - 수정: `src/app/yt/page.tsx` (Tabs 추가)
  - 신규: `src/components/DigestView.tsx` (digest/page.tsx에서 추출)
  - 삭제: `src/app/digest/page.tsx`
  - 유지: `src/app/api/digest/route.ts`
- **구현**:
  - shadcn `Tabs`: "영상" | "다이제스트"
  - **영상 탭**: 현재 /yt 내용 그대로 (검색 + 영상 목록)
  - **다이제스트 탭**: DigestView 컴포넌트 (날짜 네비, 모닝/이브닝 서브탭, 영상 카드)
  - `max-w-md mx-auto` 제거 (부모 레이아웃에 맞춤)
  - `/yt/[video_id]` 상세 페이지는 변경 없음
- **완료 기준**: 영상/다이제스트 탭 전환 + 다이제스트 모닝/이브닝 정상 + `npm run build` 성공
- **의존**: 섹션 1 완료 후

### 섹션 5: 사이드바 + CommandPalette + active 링크
- **목적**: 사이드바 6개 메뉴로 정리, CommandPalette 동기화, 현재 페이지 하이라이트
- **파일**:
  - 수정: `src/app/layout.tsx` (navItems 6개로 축소)
  - 수정: `src/components/CommandPalette.tsx` (PAGES 배열 동기화)
  - 신규: `src/components/NavLink.tsx` (usePathname 기반 active 하이라이트)
- **구현**:
  - navItems: 대시보드, 대화, 할일, 시간, 유튜브, 설정 (6개)
  - NavLink 클라이언트 컴포넌트: `usePathname()` → 현재 경로 매칭 시 `bg-sidebar-accent` 적용
  - CommandPalette PAGES: navItems와 동일하게 6개
- **완료 기준**: 사이드바 6개 메뉴 + active 하이라이트 동작 + CommandPalette 페이지 이동 정상
- **의존**: 섹션 2, 3, 4 완료 후

### 섹션 6: 공통 유틸 통합 + 빌드 검증 + Vercel 배포
- **목적**: 하드코딩 카테고리 통합, 날짜 유틸 통합, 최종 빌드 + 배포
- **파일**:
  - 신규: `src/lib/constants.ts` (CATEGORIES 상수)
  - 수정: `src/lib/utils.ts` (getToday 추가)
  - 수정: `src/components/DailyPlanEditor.tsx`, `src/components/ManualTimeForm.tsx`, `src/components/TimerWidget.tsx`, `src/app/todos/page.tsx` (하드코딩 → import)
  - 수정: `src/app/page.tsx`, `src/app/time/page.tsx` (인라인 getToday → import)
- **완료 기준**: `npm run build` 0 에러 + `npx vercel --prod` 배포 성공
- **의존**: 섹션 1~5 완료 후
