# Secretary — AI 비서 대시보드

## Overview
AI 비서 대시보드. Telegram 봇 + 웹 대시보드로 일정/메모/알림 관리.

## Tech Stack
- **Frontend**: Next.js, React, Radix UI, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **AI**: Anthropic SDK, Google Generative AI
- **Bot**: Telegram Bot API

## Build & Test
```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

## Project Structure
- `app/` — Next.js App Router 페이지
- `components/` — React 컴포넌트
- `lib/` — 유틸리티, Supabase 클라이언트
- `bot/` — Telegram 봇 서버

## Code Style
- TypeScript strict mode
- ES Modules (import/export)
- Tailwind CSS for styling (no inline styles)
- Radix UI for accessible components

## Conventions
- 환경변수는 `.env.local` (git 미추적)
- API 키 하드코딩 금지 — CLI/OAuth 방식만 사용
- Supabase 쿼리는 `lib/supabase.ts` 통해서만
