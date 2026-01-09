# Secretary - CEO 개인 비서 시스템

AI 직원들(Claude, Gemini, Grok 등)과의 대화를 기록하고, 일상 생각을 분류하고, 검색/리포트하는 시스템.

## 기술 스택

- **Frontend/Backend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini 2.5 Flash (무료)
- **배포**: Vercel (예정)

## 설치 및 실행

### 1. 의존성 설치
```bash
cd ~/projects/secretary
npm install
```

### 2. 환경 변수 설정
`.env.local` 파일 확인 (이미 설정됨):
```
NEXT_PUBLIC_SUPABASE_URL=https://wyllvrjqutmuvjovjjtf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
GEMINI_API_KEY=AIzaSy...
```

### 3. 개발 서버 실행
```bash
npm run dev
```
http://localhost:3000 접속

## 주요 기능

| 페이지 | URL | 기능 |
|--------|-----|------|
| 생각 분리수거 | `/` | 생각 입력 → AI 분류/조언 |
| 검색 | `/search` | 생각/대화 통합 검색 |
| 리포트 | `/report` | 일일 요약 |
| 대화 목록 | `/conversations` | AI 대화 기록 |

## 프로젝트 구조

```
secretary/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 메인 (생각 입력)
│   │   ├── search/page.tsx       # 검색
│   │   ├── conversations/page.tsx # 대화 목록
│   │   ├── report/page.tsx       # 리포트
│   │   └── api/
│   │       ├── thought/route.ts  # 생각 분류 API
│   │       ├── conversation/route.ts
│   │       ├── search/route.ts
│   │       └── report/route.ts
│   ├── components/               # UI 컴포넌트
│   ├── lib/
│   │   ├── supabase.ts          # Supabase 클라이언트
│   │   ├── gemini.ts            # Gemini API 클라이언트
│   │   └── classifier.ts        # 분류/요약 로직
│   └── types/index.ts           # TypeScript 타입
├── supabase/migrations/          # DB 스키마
└── extension/                    # 브라우저 확장 (Phase 5)
```

## 카테고리

- 업무
- 소개팅비즈니스
- 온라인판매
- 건강
- 가족
- 개발
- 기타

## AI 직원

| 이름 | 역할 | 사이트 |
|------|------|--------|
| Claude | CTO | claude.ai |
| Gemini | 총무 | gemini.google.com |
| Grok | 아트디렉터 | grok.x.ai |
| Perplexity | 홍보팀 | perplexity.ai |
| Genspark | 스페셜에이전트 | genspark.ai |

## 다음 작업 (Phase 5)

브라우저 확장 프로그램 개발:
- 각 AI 사이트에서 대화 추출
- "세이브" 버튼으로 DB 저장
- Chrome Manifest V3

## 문제 해결

### 서버 실행 안 될 때
```bash
# nvm 로드
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 서버 실행
cd ~/projects/secretary
npm run dev
```

### Gemini API 에러
- `gemini-2.5-flash` 모델 사용 중 (무료)
- 하루 1,500회 무료 호출 가능
