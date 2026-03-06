# Toss Redesign - Context & Findings

## 프로젝트 정보
- 경로: ~/projects/secretary/
- 스택: Next.js 16 + Tailwind v4 + Supabase
- 디자인 레퍼런스: docs/toss-design-reference.md

## 현재 파일 구조
```
src/app/
  globals.css          ← 디자인 토큰 (Tailwind @theme)
  layout.tsx           ← 사이드바+상단바+모바일탭
  page.tsx             ← Dashboard
  todos/page.tsx       ← Tasks
  time/page.tsx        ← Time Management
  history/page.tsx     ← Chat History
  yt/page.tsx          ← YouTube
  settings/page.tsx    ← Settings
```

## 핵심 색상 매핑 (AS-IS → TO-BE)

| 현재 | 토스 | 용도 |
|------|------|------|
| #050505 (dark-bg) | #17171c (background) | 기본 배경 |
| #121212 (card-bg) | #202027 (Level01) | 카드 배경 |
| #222222 (border-color) | #3c3c47 (grey200/hairline) | 보더 |
| #00f2ff (primary-neon) | #3182f6 (blue500) | 프라이머리 |
| #bc13fe (accent-purple) | 사용 안함 (제거) | - |
| zinc-900 계열 | greyOpacity100~200 | 배경 레이어 |

## Tailwind v4 @theme 참고
- `@theme {}` 블록에서 CSS custom property 정의
- `--color-*` prefix → Tailwind 클래스로 자동 매핑
- 예: `--color-toss-bg: #17171c` → `bg-toss-bg` 사용 가능

## Pretendard 폰트
- CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css`
- 또는 dynamic subset: `pretendard-dynamic-subset.min.css`
- weight: 100~900 지원
- 한글 + 영문 모두 지원

## 기존 알려진 버그 (이번 스코프에서 함께 수정)
- saveDailyPlan: `content` → `planText`로 필드명 수정 필요

## 발견사항
(섹션 진행하면서 업데이트)
