# Secretary 프로젝트 - 작업 핸드오프

## 현재 상태 (2025-01-10)

### 완료된 작업 (Phase 1-4)

- [x] Next.js 프로젝트 초기화
- [x] Supabase 연동 (테이블 생성 완료)
- [x] Gemini 2.5 Flash API 연동 (무료)
- [x] 생각 분리수거 기능 (`/api/thought`)
- [x] 대화 저장 API (`/api/conversation`)
- [x] 검색 API (`/api/search`)
- [x] 리포트 API (`/api/report`)
- [x] 모든 페이지 UI 구현

### 테스트 필요

메인 페이지에서 생각 입력 테스트:
```
오늘 거래처 미팅 잘 됐고, 소개팅앱 결제기능 고민중이고, 허리가 아프네
```

### 미완료 작업 (Phase 5)

- [ ] 브라우저 확장 프로그램 개발
  - 각 AI 사이트(Claude, Gemini, Grok 등)에서 대화 추출
  - "세이브" 버튼으로 DB 저장
  - Chrome Manifest V3

## 환경 정보

### Supabase
- URL: `https://wyllvrjqutmuvjovjjtf.supabase.co`
- 테이블: employees, categories, thoughts, conversations, sync_status, daily_reports

### Gemini API
- 모델: `gemini-2.5-flash` (무료, 하루 1,500회)
- API 키: `.env.local`에 저장됨

## 다음에 이어서 작업하려면

### 1. 서버 실행
```bash
cd ~/projects/secretary

# nvm 로드 (필요시)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 서버 실행
npm run dev
```

### 2. Claude Code에서 대화 이어가기
```bash
cd ~/projects/secretary
claude
```

그리고 이렇게 말하면 됨:
```
secretary 프로젝트 이어서 작업하자. HANDOFF.md 읽어봐.
```

## 주요 파일 위치

| 파일 | 역할 |
|------|------|
| `src/lib/gemini.ts` | Gemini API 클라이언트 |
| `src/lib/classifier.ts` | 분류/요약 프롬프트 |
| `src/app/api/thought/route.ts` | 생각 분리수거 API |
| `src/app/page.tsx` | 메인 페이지 |
| `.env.local` | 환경 변수 (API 키) |

## 알려진 이슈

1. **Gemini 모델**: `gemini-2.0-flash`는 새 프로젝트에서 할당량 0으로 막힘. `gemini-2.5-flash` 사용해야 함.

2. **nvm**: Node.js는 nvm으로 설치됨. 새 터미널에서는 nvm 로드 필요.
