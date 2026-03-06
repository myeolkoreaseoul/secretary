# Toss Redesign - Task Checklist

## 섹션 1: Design Foundation [DONE]
- [x] globals.css @theme 토스 색상 체계로 교체
- [x] Pretendard 폰트 CDN import
- [x] Plus Jakarta Sans 제거
- [x] neon/glass 유틸리티 제거
- [x] 기본 유틸리티 추가 (tabular-nums, line-height)

## 섹션 2: Layout 구조 변경 [DONE]
- [x] 사이드바 제거 -> 상단 네비바
- [x] L1 Global Nav 구현 (로고 + 메뉴 + 검색)
- [x] 활성 탭 indicator (하단 2px blue line)
- [x] 모바일 하단탭 토스 스타일
- [x] Pomodoro 타이머 상단바 우측
- [x] main 영역 padding, Settings 아이콘 우측

## 섹션 3: Dashboard 리디자인 [DONE]
- [x] 히어로 카드 3개 flat 스타일 (rounded-lg, bg-level1)
- [x] Daily Plan 섹션 토스 카드
- [x] Top Tasks 리스트 flat 스타일
- [x] Recent Chat flat 스타일
- [x] Activity Heatmap 토스 스타일
- [x] saveDailyPlan content->planText 수정

## 섹션 4: Tasks 리디자인 [DONE]
- [x] 입력 영역 토스 스타일
- [x] TodoItem 컴포넌트 토스 스타일
- [x] 우선순위 뱃지 chip 스타일
- [x] 호버: greyOpacity100 배경

## 섹션 5: Time + History 리디자인 [DONE]
- [x] Time: L2 탭 (border-bottom indicator)
- [x] Time: Hourly Breakdown flat
- [x] Time: Manual Entry flat
- [x] Time: Weekly tab placeholder
- [x] History: 검색바 토스 Input
- [x] History: 메시지 버블 flat
- [x] History: 날짜 그룹 스타일

## 섹션 6: YouTube + Settings 리디자인 [DONE]
- [x] YT: L2 탭 스타일
- [x] YT: Digest/Videos 카드 flat
- [x] Settings: 좌측 탭 토스 스타일
- [x] Settings: 카테고리 리스트 flat
- [x] Settings: System Info flat
- [x] Settings: Security placeholder

## 섹션 7: 빌드 검증 [DONE]
- [x] npm run build 성공
- [x] 기존 neon/glass 참조 0건 확인
- [x] 앱 페이지 zinc/slate 잔여 0건
- [ ] 커밋
