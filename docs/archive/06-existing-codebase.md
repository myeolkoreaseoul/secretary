# 기존 코드베이스 정리 (Phase 1-4)

## 디렉토리 구조

```
/home/john/projects/secretary/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 루트 레이아웃 (네비바 포함)
│   │   ├── page.tsx                # 홈 — 생각 입력
│   │   ├── globals.css             # Tailwind + 테마
│   │   ├── conversations/page.tsx   # 대화 목록
│   │   ├── search/page.tsx          # 검색
│   │   ├── report/page.tsx          # 일일 리포트
│   │   └── api/
│   │       ├── thought/route.ts     # POST: 생각 분류
│   │       ├── conversation/route.ts # POST/GET: 대화 저장/목록
│   │       ├── search/route.ts      # GET: 검색
│   │       └── report/route.ts      # GET: 일일 리포트
│   ├── components/
│   │   ├── ThoughtInput.tsx         # 생각 입력 폼
│   │   ├── ThoughtResult.tsx        # 분류 결과 표시
│   │   ├── SearchBar.tsx            # 검색바 + 필터
│   │   ├── CategoryBadge.tsx        # 카테고리 뱃지 (색상)
│   │   ├── EmployeeBadge.tsx        # AI 직원 뱃지
│   │   └── ConversationCard.tsx     # 대화 카드
│   ├── lib/
│   │   ├── supabase.ts              # Supabase 클라이언트
│   │   ├── gemini.ts                # Gemini API (callGemini)
│   │   ├── claude.ts                # Claude API (미사용)
│   │   ├── groq.ts                  # Groq API (미사용)
│   │   └── classifier.ts            # 분류기 + 요약기
│   └── types/
│       └── index.ts                 # 전체 타입 정의
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   # 초기 스키마
│       └── 002_chat_schema.sql      # 채팅 스키마 (v2, 작성됨)
├── docs/                            # 설계 문서 (v2)
├── .env.local                       # API 키
├── package.json
├── tsconfig.json                    # strict, @/* → ./src/*
├── postcss.config.mjs               # Tailwind CSS 4
└── next.config.ts                   # 최소 설정
```

## 의존성 (package.json)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.71.2",
    "@google/generative-ai": "^0.24.1",
    "@supabase/supabase-js": "^2.90.1",
    "groq-sdk": "^0.37.0",
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    // v2에서 추가됨 (이미 설치):
    "lucide-react", "class-variance-authority", "clsx",
    "tailwind-merge", "date-fns", "react-markdown",
    "react-textarea-autosize"
  }
}
```

## 환경 변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://wyllvrjqutmuvjovjjtf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
GEMINI_API_KEY=<key>
```

## DB 스키마 (현재)

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|----------|
| employees | AI 직원 5명 | name, role, site_url |
| categories | 분류 7개 | name, color |
| thoughts | 생각 분리수거 | raw_input, category_id, title, summary, advice, search_vector |
| conversations | AI 대화 기록 | employee_id, content, summary, category_id, tags, search_vector |
| daily_reports | 일일 리포트 | report_date, content |
| sync_status | 동기화 상태 | employee_id, last_synced_at |

## 카테고리 (7개, 색상 코딩)

| 이름 | 색상 | 설명 |
|------|------|------|
| 업무 | #3B82F6 (파랑) | 회사 업무, 거래처, 세금 |
| 소개팅비즈니스 | #EC4899 (핑크) | 소개팅앱 개발, 수익모델 |
| 온라인판매 | #F59E0B (노랑) | 이커머스, 온라인 판매 |
| 건강 | #10B981 (초록) | 운동, 병원 |
| 가족 | #8B5CF6 (보라) | 가족 관련 |
| 개발 | #6366F1 (인디고) | 코딩, 기술 |
| 기타 | #6B7280 (회색) | 기타 |

## 핵심 함수들

### lib/gemini.ts
```typescript
callGemini(systemPrompt: string, userMessage: string): Promise<string>
// gemini-2.5-flash 모델, systemInstruction 사용
```

### lib/classifier.ts
```typescript
classifyThought(input: string): Promise<ClassifierResponse>
// 카테고리/제목/요약/조언 JSON 반환

summarizeConversation(content: string): Promise<{title, category, summary}>
// 대화 내용 → 제목/카테고리/요약
```

### lib/supabase.ts
```typescript
supabase = createClient(url, key, { auth: { persistSession: false } })
```

## 재활용 가능한 것

| 파일 | 재활용 내용 |
|------|------------|
| supabase.ts | 클라이언트 그대로 사용 |
| classifier.ts | 카테고리 정의, JSON 파싱 패턴 참고 |
| CategoryBadge.tsx | 색상 매핑 참고 (shadcn Badge로 대체) |
| types/index.ts | 기존 타입 유지, 새 타입 추가 |
| .env.local | 환경 변수 그대로 |
| 기존 API 라우트 | 삭제하지 않고 유지 (호환성) |
