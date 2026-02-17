# V2 플랜 — 모듈 1: 채팅 비서 (초기 플랜, 재검토 필요)

> ⚠️ 이 플랜은 모듈 1(채팅)만 다루며, 시간 추적/에이전틱이 빠져 있음.
> AI도 Gemini → Claude CLI로 변경 필요.
> 최종 플랜 작성 전 참고용.

## Tech Stack

| 역할 | 기술 | 이유 |
|------|------|------|
| LLM (두뇌) | ~~Gemini 2.5 Flash~~ → **Claude CLI (Max)** | 사용자 선택 |
| 임베딩 | Gemini text-embedding-004 | 무료, 768차원, Claude는 임베딩 불가 |
| 벡터 DB | Supabase pgvector | 기존 Supabase 활용 |
| 프론트엔드 | Next.js + shadcn/ui | 기존 프로젝트 확장 |
| 스타일링 | Tailwind CSS 4 + 다크모드 | 기존 설정 활용 |

## 핵심 데이터 플로우

```
사용자 메시지 입력
    ↓
POST /api/chat/message
    ↓
1. 사용자 메시지 DB 저장
2. 임베딩 생성 (Gemini text-embedding-004)
3. 벡터 검색 → 과거 관련 메시지/생각 top 10~15개
4. 시스템 프롬프트 조립 (기본 + 과거 맥락 + 세션 히스토리)
5. Claude CLI 스트리밍 응답 생성 (claude --print --stream)
6. 실시간 SSE로 프론트에 전송
7. 완료 후: AI 응답 DB 저장 + 임베딩 + 메타데이터 추출
8. 첫 대화면 세션 제목 자동 생성
```

## DB 마이그레이션 (작성 완료)

파일: `supabase/migrations/002_chat_schema.sql`

### 새 테이블
- `chat_sessions`: 대화 세션 (id, title, created_at, updated_at, is_archived, message_count)
- `chat_messages`: 메시지 (id, session_id, role, content, metadata, embedding vector(768), created_at, token_estimate)

### 새 함수
- `search_similar_content(query_embedding, threshold, count)`: 벡터 유사도 검색
- `update_session_message_count()`: 트리거 — 메시지 삽입 시 세션 카운트 자동 증가

### 기존 테이블 수정
- `thoughts`: embedding vector(768) 컬럼 추가
- `conversations`: embedding vector(768) 컬럼 추가

## 백엔드 라이브러리 (7개)

| 파일 | 역할 |
|------|------|
| `src/lib/utils.ts` | shadcn cn() 유틸리티 |
| `src/lib/embedding.ts` | Gemini text-embedding-004로 768차원 벡터 생성 |
| `src/lib/gemini.ts` (수정) | streamGemini, generateGeminiEmbedding 추가 |
| `src/lib/vector-search.ts` | 임베딩 → pgvector RPC → 유사 콘텐츠 검색 |
| `src/lib/prompts.ts` | AI 비서 시스템 프롬프트 + 카테고리 정의 |
| `src/lib/chat-engine.ts` | 벡터검색 + 히스토리 → 프롬프트 조립, 제목 생성 |
| `src/lib/stream.ts` | SSE ReadableStream (chunk/done/error) |

## API 라우트 (4개)

| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `/api/chat/message` | POST | 메시지 → 임베딩 → 벡터검색 → AI 응답 스트리밍 |
| `/api/chat/sessions` | GET/POST | 세션 목록 / 새 세션 생성 |
| `/api/chat/sessions/[id]` | GET/DELETE | 세션 메시지 로드 / 아카이브 |
| `/api/backfill` | POST | 기존 thoughts/conversations 임베딩 백필 |

## 프론트엔드 컴포넌트 (8개)

```
ChatLayout (전체 화면)
  ├── ChatSidebar (왼쪽, 모바일: Sheet)
  │     ├── 새 대화 버튼
  │     └── ChatSessionItem[] (세션 목록)
  └── ChatArea (오른쪽 메인)
        ├── ChatWelcome (빈 상태)
        ├── ScrollArea → ChatMessage[] (버블형)
        │     ├── MarkdownRenderer (AI 마크다운)
        │     └── ChatMetadataCard (카테고리/조언)
        └── ChatInput (하단 고정, 자동 확장)
```

## 페이지 수정

| 파일 | 변경 |
|------|------|
| `src/app/chat/page.tsx` | 새 채팅 페이지 |
| `src/app/layout.tsx` | 헤더 제거, 다크모드 기본 |
| `src/app/page.tsx` | `/chat` 리다이렉트 |
| `src/app/globals.css` | shadcn CSS 변수 + 강제 다크모드 |
| `src/types/index.ts` | ChatSession, ChatMessage 등 5개 타입 추가 |

## 새로 설치할 패키지

```
lucide-react class-variance-authority clsx tailwind-merge
date-fns react-markdown react-textarea-autosize
shadcn/ui (button input textarea scroll-area avatar badge card separator skeleton sheet)
```
> 일부 이미 설치됨 (lucide-react, cva, clsx, tailwind-merge, date-fns, react-markdown, react-textarea-autosize)
