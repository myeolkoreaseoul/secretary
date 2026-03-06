# Secretary Frontend Redesign - Toss Design System 적용

## 개요
현재 네온/사이버펑크 테마(#00f2ff, #bc13fe, glass-effect, neon-border)를
토스증권 스타일의 Flat Dark 디자인으로 전면 교체.
레퍼런스: `docs/toss-design-reference.md`

## 현재 상태 분석

### AS-IS
- Font: Plus Jakarta Sans (Google Fonts)
- Theme: 네온 cyan/purple, glass blur, gradient text, neon glow
- Layout: 좌측 사이드바(264px) + 상단바(64px) + 모바일 하단탭
- Cards: rounded-[24px], bg-zinc-900/40, glass-effect, neon-border
- CSS: Tailwind v4, @theme directive in globals.css
- 파일 수: layout.tsx + 6 페이지 + globals.css = 8 파일 수정 대상

### TO-BE (Toss Design)
- Font: Pretendard (CDN)
- Theme: Flat dark (#17171c base), opacity-based layering, no glow/gradient
- Layout: 상단 네비(L1) + 서브탭(L2) + 필터칩(L3), 사이드바 제거
- Cards: rounded-lg(8px), bg-[#202027], border-[#3c3c47], flat
- Colors: grey scale 10단계 + greyOpacity 9단계 + semantic(blue/red/green)

## 섹션별 실행 계획

---

### 섹션 1: Design Foundation (globals.css + font)
**목표**: 디자인 토큰 전면 교체, Pretendard 폰트 적용

**작업**:
1. `globals.css` @theme 블록 완전 교체
   - 기존: --color-primary-neon, --color-accent-purple, --color-dark-bg 등
   - 신규: 토스 색상 체계 (background hierarchy, grey scale, semantic colors)
2. Pretendard 폰트 CDN 추가 (`layout.tsx` 또는 globals.css)
   - `@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css');`
   - Plus Jakarta Sans import 제거
3. 네온/글래스 유틸리티 제거 (glass-effect, neon-border-blue, neon-border-purple)
4. 기본 유틸리티 추가 (hover transitions, tabular-nums)

**수정 파일**: `globals.css`, `layout.tsx`
**예상 문제**: 기존 neon/glass 클래스 참조가 다른 파일에서 에러 발생 → 섹션 2~4에서 순차 해결

---

### 섹션 2: Layout 구조 변경 (layout.tsx)
**목표**: 사이드바 → 상단 네비바로 전환, 토스 3단계 네비 구조 적용

**작업**:
1. 사이드바(`<aside>`) 제거
2. 상단 네비바 구현 (L1 Global Nav)
   - 좌측: 로고 "SECRETARY" (볼드, 네온 제거)
   - 중앙: 네비 링크 (Dashboard | Tasks | Time | History | YouTube)
   - 우측: 검색 + 설정 아이콘
   - sticky 상단, bg #17171c, border-bottom #3c3c47
3. 모바일 하단탭 스타일 업데이트 (네온 제거, 토스 컬러)
4. Pomodoro 타이머 위젯 → 상단바 우측으로 이동, 토스 스타일 적용
5. `<main>` 영역: max-width, centered, padding 조정

**수정 파일**: `layout.tsx`
**디자인 결정**:
- L1: 상단 고정 바, height 52px (토스 기준)
- Settings는 L1에서 제외 → 우측 아이콘으로
- 활성 탭: font-weight 600 + 하단 indicator (2px blue500 line)
- 모바일: 상단 로고 + 하단탭(5개)

---

### 섹션 3: Dashboard (page.tsx) 리디자인
**목표**: 토스 Dashboard 패턴 적용 - 요약 카드 그리드, 밀집 데이터

**작업**:
1. 히어로 카드 영역: 3컬럼 → 토스 스타일 flat card
   - rounded-[24px] → rounded-lg (8px)
   - neon glow/gradient 제거
   - bg #202027, border #3c3c47
   - 숫자: 큰 bold + tabular-nums
2. Daily Plan 섹션: 토스 스타일 카드
3. Top Tasks / Recent Chat: 2컬럼 그리드 유지, 스타일 교체
4. Activity Heatmap: 더미 유지하되 토스 스타일 적용
5. saveDailyPlan의 `content` → `planText` 필드 수정 (기존 버그)

**수정 파일**: `page.tsx`

---

### 섹션 4: Tasks 페이지 (todos/page.tsx) 리디자인
**목표**: 토스 Explorer 패턴 - 필터 칩 + 리스트

**작업**:
1. 입력 영역 스타일 교체 (flat input, 토스 버튼)
2. TodoItem 컴포넌트 스타일 교체
   - rounded-2xl → rounded-lg
   - 호버: greyOpacity100 배경
   - 우선순위 뱃지: 토스 chip 스타일
3. 섹션 헤더 스타일

**수정 파일**: `todos/page.tsx`

---

### 섹션 5: Time + History 페이지 리디자인
**목표**: Time은 Detail 패턴(히어로+탭), History는 Feed 패턴

**작업 - Time (time/page.tsx)**:
1. 탭 네비 스타일 → 토스 L2 탭 (텍스트 기반, 하단 indicator)
2. Hourly Breakdown: flat 스타일
3. Manual Entry: flat 스타일 (여전히 더미)

**작업 - History (history/page.tsx)**:
1. 검색바: 토스 Input 스타일
2. 메시지 버블: 토스 스타일 (flat, no neon)
3. 날짜 그룹 헤더 스타일

**수정 파일**: `time/page.tsx`, `history/page.tsx`

---

### 섹션 6: YouTube + Settings 페이지 리디자인
**목표**: YT는 Feed 패턴, Settings는 Account 패턴

**작업 - YouTube (yt/page.tsx)**:
1. 탭 스타일 교체
2. 카드 스타일 교체 (여전히 더미 데이터)

**작업 - Settings (settings/page.tsx)**:
1. 좌측 탭 네비 스타일 교체
2. 카테고리 리스트 스타일 교체
3. System Info 카드 스타일 교체

**수정 파일**: `yt/page.tsx`, `settings/page.tsx`

---

### 섹션 7: 빌드 검증 + 마무리
**목표**: 전체 빌드 성공 확인, 잔여 스타일 정리

**작업**:
1. `npm run build` 실행
2. 미사용 import 정리
3. 공통 컴포넌트(components/ui/*) 색상 업데이트 필요 시 수정
4. 커밋

---

## 예상 문제점 및 해결방안

| 문제 | 해결 |
|------|------|
| Pretendard CDN 로딩 속도 | `font-display: swap` 설정, 실사용에서 문제 없음 |
| 기존 neon 클래스 참조 깨짐 | 섹션 1에서 유틸리티는 제거, 2~6에서 인라인 클래스 교체 |
| Tailwind v4 @theme 호환 | @theme 블록에 CSS custom property로 정의, 확인됨 |
| 사이드바→상단바 전환 시 레이아웃 깨짐 | flex 방향 전환 (row→column) |
| 색상 하드코딩 (zinc-800, zinc-900) | 토스 색상으로 1:1 매핑 |

## 장단점

**장점**:
- 프로답고 깔끔한 UI (토스 증권 수준)
- 정보 밀도 높아짐 (작은 폰트, 좁은 간격)
- 네온/글로우 제거로 가독성 향상
- 상단 네비로 화면 활용도 증가 (사이드바 264px 절약)

**단점**:
- 전체 UI 파일 8개 수정 필요 (대규모)
- 기존 디자인 완전 폐기 (롤백 시 git revert)
- 더미 기능들은 여전히 더미 (이번 스코프 아님)
