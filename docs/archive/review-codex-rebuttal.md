OpenAI Codex v0.101.0 (research preview)
--------
workdir: /home/john/projects/secretary
model: gpt-5.3-codex
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: auto
session id: 019c66ac-82c6-7c02-8600-6d4dd4a1040b
--------
user
다음은 Gemini가 동일 아키텍처에 대해 제출한 리뷰 TOP 이슈입니다:

1. search_similar_content 함수 덮어쓰기로 chat_messages 검색 누락 (중간)
2. classify_message 함수가 비효율적 (낮음)
3. 폴링10초+타이머1분 = 최대 70초 지연 (중간)
4. --dangerously-skip-permissions RCE 취약점 (높음)
5. 임베딩 모델 혼용(Gemini+Fireworks)으로 벡터 공간 불일치 (높음)
6. pending_messages.json race condition (높음)
7. 웹 대시보드 실시간성 부재 (중간)

Gemini는 5번과 6번을 가장 치명적이라고 봤습니다.

질문: Gemini의 지적 중 과장된 것이 있나요? 1인 개인 프로젝트 맥락에서 실용적 관점으로 TOP 5 수정사항을 뽑아주세요. 한국어로 답변해주세요.
mcp startup: no servers

thinking
**Acknowledging inspection start**
codex
요청하신 7개 이슈를 저장소 코드 기준으로 빠르게 검증한 뒤, 개인 프로젝트 현실을 반영해 “과장 여부”와 “실용 TOP 5 수정 우선순위”를 정리하겠습니다. 먼저 관련 함수와 실행 플로우를 찾아 사실관계를 확인하겠습니다.
exec
/bin/bash -lc 'rg --files .' in /home/john/projects/secretaryexec
/bin/bash -lc 'rg -n "search_similar_content|classify_message|pending_messages|dangerously-skip-permissions|embedding|Gemini|Fireworks|poll|timer|dashboard|chat_messages" -S .' in /home/john/projects/secretary succeeded in 51ms:
./HANDOFF.md
./next.config.ts
./README.md
./eslint.config.mjs
./package-lock.json
./postcss.config.mjs
./package.json
./tsconfig.json
./docs/05-gap-analysis.md
./docs/08-sonolbot-analysis.md
./docs/progress.md
./docs/review-gemini-rebuttal.md
./docs/review-codex-rebuttal.md
./docs/07-openclaw-analysis.md
./docs/01-original-requirements.md
./docs/06-existing-codebase.md
./docs/04-time-tracker-requirements.md
./docs/09-deep-analysis-report.md
./docs/review-codex.md
./docs/03-architecture-decisions.md
 succeeded in 52ms:
./HANDOFF.md:9:- [x] Gemini 2.5 Flash API 연동 (무료)
./HANDOFF.md:26:  - 각 AI 사이트(Claude, Gemini, Grok 등)에서 대화 추출
./HANDOFF.md:36:### Gemini API
./HANDOFF.md:69:| `src/lib/gemini.ts` | Gemini API 클라이언트 |
./HANDOFF.md:77:1. **Gemini 모델**: `gemini-2.0-flash`는 새 프로젝트에서 할당량 0으로 막힘. `gemini-2.5-flash` 사용해야 함.
./README.md:3:AI 직원들(Claude, Gemini, Grok 등)과의 대화를 기록하고, 일상 생각을 분류하고, 검색/리포트하는 시스템.
./README.md:9:- **AI**: Google Gemini 2.5 Flash (무료)
./README.md:61:│   │   ├── gemini.ts            # Gemini API 클라이언트
./README.md:83:| Gemini | 총무 | gemini.google.com |
./README.md:108:### Gemini API 에러
./supabase/migrations/002_chat_schema.sql:14:-- chat_messages: 개별 메시지 (핵심 테이블)
./supabase/migrations/002_chat_schema.sql:15:CREATE TABLE chat_messages (
./supabase/migrations/002_chat_schema.sql:21:  embedding vector(768),
./supabase/migrations/002_chat_schema.sql:27:CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, created_at);
./supabase/migrations/002_chat_schema.sql:28:CREATE INDEX chat_messages_embedding_idx ON chat_messages
./supabase/migrations/002_chat_schema.sql:29:  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
./supabase/migrations/002_chat_schema.sql:31:-- 기존 테이블에 embedding 컬럼 추가
./supabase/migrations/002_chat_schema.sql:32:ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
./supabase/migrations/002_chat_schema.sql:33:ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);
./supabase/migrations/002_chat_schema.sql:36:CREATE OR REPLACE FUNCTION search_similar_content(

thinking
**Assessing code and docs consistency**
codex
핵심 파일 목록을 확인했고, 실제 코드 기준으로 보면 일부 이슈는 “현재 코드”가 아니라 “설계 문서” 단계일 가능성이 큽니다. 이제 마이그레이션과 API/분류 코드를 직접 열어 각 항목을 사실검증하겠습니다.
exec
/bin/bash -lc "sed -n '1,240p' supabase/migrations/002_chat_schema.sql" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/lib/classifier.ts" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/app/api/search/route.ts" in /home/john/projects/secretary succeeded in 51ms:
-- pgvector 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- chat_sessions: 대화 세션
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE,
  message_count INTEGER DEFAULT 0
);

-- chat_messages: 개별 메시지 (핵심 테이블)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
 succeeded in 50ms:
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { SearchResult } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const employee = searchParams.get('employee');
    const category = searchParams.get('category');

    const results: SearchResult[] = [];

    // 검색어를 tsquery 형식으로 변환
    const searchTerms = q.trim().split(/\s+/).filter(Boolean);
    const tsQuery = searchTerms.length > 0
      ? searchTerms.map(term => `${term}:*`).join(' & ')
      : '';

    // 대화 검색
 succeeded in 50ms:
import { callGemini } from './gemini';
import { ClassifierResponse } from '@/types';

const CLASSIFIER_PROMPT = `당신은 생각 분리수거 전문가입니다.
사용자가 던진 텍스트를 분석해서 각각의 주제를 분류하고, 요약하고, 조언을 제공합니다.

## 카테고리
- 업무: 회사 업무, 거래처, 세금, 회계 관련
- 소개팅비즈니스: 소개팅앱 개발, 수익모델, 마케팅 등
- 온라인판매: 이커머스, 온라인 판매 사업
- 건강: 신체 건강, 운동, 병원
- 가족: 가족 관련 일
- 개발: 코딩, 기술, 시스템 구축
- 기타: 위에 해당 안 되는 것

## 규칙
1. 하나의 입력에 여러 주제가 있으면 각각 분리해서 처리
2. 각 주제마다: 카테고리, 제목(20자 이내), 요약(50자 이내), 조언(100자 이내) 제공
3. 조언은 실용적이고 구체적으로


thinking
**Searching for migration artifacts**
codex
현재 확인 결과 실제 앱 코드에는 `classify_message`, `pending_messages.json`, `--dangerously-skip-permissions`가 보이지 않고 문서에만 주로 등장합니다. 코드/문서 경계를 분리해서 과장 여부를 판단하기 위해 해당 키워드의 “비문서” 출현을 추가 점검하겠습니다.
exec
/bin/bash -lc "sed -n '1,260p' README.md" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' HANDOFF.md" in /home/john/projects/secretaryexec
/bin/bash -lc "rg -n \"classify_message|pending_messages\\.json|dangerously-skip-permissions|telegram_messages|search_similar_content\\(\" -S . --glob '"'!docs/**'"'" in /home/john/projects/secretary succeeded in 52ms:
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
 succeeded in 52ms:
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
 succeeded in 52ms:
./supabase/migrations/002_chat_schema.sql:36:CREATE OR REPLACE FUNCTION search_similar_content(

thinking
**Reviewing realtime and permission issues**
codex
현재 저장소 기준으로는 7개 중 다수가 “아직 구현되지 않은 봇/운영 아키텍처” 문서에서 나온 지적입니다. 남은 판단 정확도를 높이기 위해 API 라우트와 대시보드 페이지가 실제로 어떻게 동작하는지 추가로 확인하겠습니다.
exec
/bin/bash -lc "sed -n '1,260p' src/app/api/thought/route.ts" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/app/conversations/page.tsx" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/app/api/conversation/route.ts" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/app/report/page.tsx" in /home/john/projects/secretaryexec
/bin/bash -lc "sed -n '1,260p' src/lib/gemini.ts" in /home/john/projects/secretary succeeded in 50ms:
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { summarizeConversation } from '@/lib/classifier';
import { ConversationRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: ConversationRequest = await request.json();
    const { employee, content, source_url, conversation_date } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: '대화 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    // 직원 조회
    const { data: employeeData } = await supabase
      .from('employees')
 succeeded in 51ms:
'use client';

import { useEffect, useState } from 'react';
import ConversationCard from '@/components/ConversationCard';

interface ConversationData {
  id: string;
  title: string | null;
  summary: string | null;
  conversation_date: string | null;
  employee: {
    name: string;
    role: string | null;
  } | null;
  category: {
    name: string;
    color: string | null;
  } | null;
}

 succeeded in 51ms:
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { classifyThought } from '@/lib/classifier';
import { ThoughtRequest, ThoughtResponse } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: ThoughtRequest = await request.json();
    const { input } = body;

    if (!input || !input.trim()) {
      return NextResponse.json(
        { error: '입력이 필요합니다.' },
        { status: 400 }
      );
    }

    // Claude API로 분류
    const classifierResult = await classifyThought(input);

 succeeded in 51ms:
'use client';

import { useEffect, useState } from 'react';
import CategoryBadge from '@/components/CategoryBadge';
import EmployeeBadge from '@/components/EmployeeBadge';

interface ReportData {
  date: string;
  summary: {
    thoughts: number;
    conversations: number;
  };
  by_category: {
    category: string;
    color: string;
    count: number;
  }[];
  by_employee: {
    employee: string;
    role: string;
 succeeded in 51ms:
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userMessage);
  const response = result.response;
  return response.text();
}

thinking
**Assessing Gemini issue relevance**
codex
사실관계 근거를 명확히 하려고, 코드와 설계 문서에서 해당 이슈가 어디에 있는지 줄 번호까지 확인하고 있습니다. 이 근거로 “과장”과 “실수정 우선순위”를 분리해서 바로 정리하겠습니다.
exec
/bin/bash -lc "nl -ba docs/progress.md | sed -n '84,120p'" in /home/john/projects/secretaryexec
/bin/bash -lc "nl -ba supabase/migrations/002_chat_schema.sql | sed -n '30,90p'" in /home/john/projects/secretaryexec
/bin/bash -lc "nl -ba docs/review-prompt.md | sed -n '140,210p'" in /home/john/projects/secretaryexec
/bin/bash -lc "nl -ba docs/progress.md | sed -n '260,280p'" in /home/john/projects/secretaryexec
/bin/bash -lc "nl -ba src/app/conversations/page.tsx | sed -n '1,120p'" in /home/john/projects/secretary succeeded in 51ms:
    30	
    31	-- 기존 테이블에 embedding 컬럼 추가
    32	ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
    33	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);
    34	
    35	-- 벡터 유사도 검색 함수
    36	CREATE OR REPLACE FUNCTION search_similar_content(
    37	  query_embedding vector(768),
    38	  match_threshold FLOAT DEFAULT 0.3,
    39	  match_count INT DEFAULT 10
    40	) RETURNS TABLE (
    41	  id UUID, source_type TEXT, content TEXT,
    42	  metadata JSONB, similarity FLOAT, created_at TIMESTAMP
    43	) LANGUAGE plpgsql AS $$
    44	BEGIN
    45	  RETURN QUERY
    46	  SELECT cm.id, 'chat_message'::TEXT, cm.content, cm.metadata,
    47	    1 - (cm.embedding <=> query_embedding) as similarity, cm.created_at
    48	  FROM chat_messages cm WHERE cm.embedding IS NOT NULL
    49	    AND 1 - (cm.embedding <=> query_embedding) > match_threshold
 succeeded in 51ms:
    84	> **⚠️ 핵심 관건 (프로토타입 후 재확인)**
    85	> Claude CLI 단독 시 응답 20~30초가 체감상 괜찮은지 확인 필요.
    86	> 불만이면 A안(현재, Claude 단독) → B안(Gemini 즉시+Claude 백그라운드)로 전환.
    87	> B안의 리스크: 구현 복잡도 증가, Gemini 무료 의존, 톤 불일치.
    88	
    89	### 2-10. 임베딩 제공자
    90	- **주: Gemini text-embedding-004** (무료, 1,000/일, 768차원)
    91	- **백업: Fireworks nomic-embed-text** ($0.008/1M = 월 ~$0.31)
    92	- 추상화 레이어로 감싸서 Gemini 장애 시 자동 전환
    93	- Ollama: 맥북 2009 Core 2 Duo AVX 미지원 → 실행 불가 탈락
    94	
    95	---
    96	
    97	## 3. 인프라 결정
    98	
    99	### 서버 환경
   100	| 역할 | 하드웨어 | 비고 |
   101	|------|---------|------|
   102	| 개발 | Ryzen 5 7535HS 노트북 | Windows/WSL |
   103	| 상시 서버 | MacBook Pro A1278 (2009 Mid) | Ubuntu, SSD, 8GB RAM |
 succeeded in 51ms:
   140	  created_at TIMESTAMP DEFAULT NOW()
   141	);
   142	
   143	-- 기존 테이블에 embedding 컬럼 (002에서 이미 추가됨, IF NOT EXISTS로 안전)
   144	ALTER TABLE thoughts ADD COLUMN IF NOT EXISTS embedding vector(768);
   145	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS embedding vector(768);
   146	
   147	-- 통합 벡터 검색 함수 (002의 함수를 확장, telegram_messages 추가)
   148	CREATE OR REPLACE FUNCTION search_similar_content(
   149	  query_embedding vector(768),
   150	  match_threshold FLOAT DEFAULT 0.25,
   151	  match_count INT DEFAULT 15
   152	) RETURNS TABLE (
   153	  id UUID, source_type TEXT, content TEXT,
   154	  metadata JSONB, similarity FLOAT, created_at TIMESTAMP
   155	) LANGUAGE plpgsql AS $$
   156	BEGIN
   157	  RETURN QUERY
   158	  SELECT tm.id, 'telegram'::TEXT, tm.content, tm.metadata,
   159	    1 - (tm.embedding <=> query_embedding) as similarity, tm.created_at
 succeeded in 51ms:
     1	'use client';
     2	
     3	import { useEffect, useState } from 'react';
     4	import ConversationCard from '@/components/ConversationCard';
     5	
     6	interface ConversationData {
     7	  id: string;
     8	  title: string | null;
     9	  summary: string | null;
    10	  conversation_date: string | null;
    11	  employee: {
    12	    name: string;
    13	    role: string | null;
    14	  } | null;
    15	  category: {
    16	    name: string;
    17	    color: string | null;
    18	  } | null;
    19	}
    20	
 succeeded in 51ms:
   260	---
   261	
   262	## 7. 핵심 기술 검증 결과
   263	
   264	### Claude CLI 호출
   265	```bash
   266	# 독립 실행 (소놀봇 방식):
   267	claude -p -c --dangerously-skip-permissions --append-system-prompt-file CLAUDE.md "프롬프트"
   268	
   269	# Claude Code 안에서:
   270	env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE claude --print -p "프롬프트"
   271	```
   272	
   273	### 소놀봇 핵심 패턴
   274	```
   275	1분 폴링 → quick_check(0.1초) → 메시지 없으면 종료
   276	                              → 있으면 Claude CLI 실행
   277	                              → 3중 락으로 동시 실행 방지
   278	                              → -c 플래그로 세션 연속성
   279	```
exec
/bin/bash -lc "nl -ba src/lib/classifier.ts | sed -n '1,140p'" in /home/john/projects/secretary succeeded in 51ms:
     1	import { callGemini } from './gemini';
     2	import { ClassifierResponse } from '@/types';
     3	
     4	const CLASSIFIER_PROMPT = `당신은 생각 분리수거 전문가입니다.
     5	사용자가 던진 텍스트를 분석해서 각각의 주제를 분류하고, 요약하고, 조언을 제공합니다.
     6	
     7	## 카테고리
     8	- 업무: 회사 업무, 거래처, 세금, 회계 관련
     9	- 소개팅비즈니스: 소개팅앱 개발, 수익모델, 마케팅 등
    10	- 온라인판매: 이커머스, 온라인 판매 사업
    11	- 건강: 신체 건강, 운동, 병원
    12	- 가족: 가족 관련 일
    13	- 개발: 코딩, 기술, 시스템 구축
    14	- 기타: 위에 해당 안 되는 것
    15	
    16	## 규칙
    17	1. 하나의 입력에 여러 주제가 있으면 각각 분리해서 처리
    18	2. 각 주제마다: 카테고리, 제목(20자 이내), 요약(50자 이내), 조언(100자 이내) 제공
    19	3. 조언은 실용적이고 구체적으로
    20	

thinking
**Prioritizing practical top fixes**
codex
핵심만 말하면, Gemini 지적은 **방향은 대체로 맞지만 일부는 현재 코드 기준으로 과장/시기상조**입니다.

1) **과장 여부 판정 (현재 저장소 기준)**  
- `#1 search_similar_content 덮어쓰기`: **현재 코드엔 미발생**. `chat_messages` 검색이 살아있습니다 (`supabase/migrations/002_chat_schema.sql:46`). 다만 문서의 계획 SQL은 실제로 회귀를 만들 수 있음 (`docs/review-prompt.md:148`).  
- `#2 classify_message 비효율`: **과장 가능성 큼**. 현재 앱 코드엔 해당 함수 자체가 없음 (`src/lib/classifier.ts:57`).  
- `#3 70초 지연`: **중간→낮음(개인 프로젝트 기준)**. 실시간 제품이면 문제, 개인 비서면 허용 가능한 경우가 많음. 근거 설계는 문서에만 있음 (`docs/review-prompt.md:176`, `docs/progress.md:111`).  
- `#4 --dangerously-skip-permissions RCE`: **표현은 다소 강하지만 위험 자체는 큼**. 특히 텔레그램 같은 외부 입력을 받으면 프롬프트 인젝션 표면이 커집니다 (`docs/review-prompt.md:180`, `docs/progress.md:267`).  
- `#5 임베딩 모델 혼용`: **과장 아님, 핵심 리스크 맞음**. 문서상 Gemini+Fireworks 자동 전환이 명시되어 있음 (`docs/progress.md:90`).  
- `#6 pending_messages.json race`: **실제로 취약 가능성 높음**. 다중 프로세스 구조에서 파일 큐는 깨지기 쉬움 (`docs/review-prompt.md:177`).  
- `#7 대시보드 실시간성 부재`: **우선순위 낮음**. 현재 대시보드는 단순 fetch 구조 (`src/app/conversations/page.tsx:25`).

2) **1인 프로젝트 실용 TOP 5 수정 우선순위**
1. **임베딩 일관성 고정 (#5)**  
   - 단일 모델만 사용하거나, 모델별로 인덱스/컬럼/검색 경로를 완전 분리.
2. **파일 큐 제거 (#6)**  
   - `pending_messages.json` 대신 DB 큐 테이블 + row lock(`FOR UPDATE SKIP LOCKED`)로 전환.
3. **권한 우회 플래그 제거/격리 (#4)**  
   - `--dangerously-skip-permissions` 최소화, 실행 래퍼(허용 명령 allowlist) 도입.
4. **검색 함수 회귀 방지 (#1)**  
   - 마이그레이션 시 `chat_messages` 누락 방지 테스트 추가, 함수 변경 시 union 유지 검증.
5. **지연 개선은 필요할 때만 (#3)**  
   - 먼저 체감 측정 후, 불만이 있을 때만 이벤트 기반/주기 단축 적용.

`#2`와 `#7`은 지금 당장 고칠 “핵심 리스크”는 아닙니다.  
즉, Gemini가 꼽은 **#5, #6은 실제로 상위 우선순위가 맞고**, `#4`도 개인 프로젝트라도 외부 입력이 있으면 거의 같은 급으로 봐야 합니다.
tokens used
25,500
핵심만 말하면, Gemini 지적은 **방향은 대체로 맞지만 일부는 현재 코드 기준으로 과장/시기상조**입니다.

1) **과장 여부 판정 (현재 저장소 기준)**  
- `#1 search_similar_content 덮어쓰기`: **현재 코드엔 미발생**. `chat_messages` 검색이 살아있습니다 (`supabase/migrations/002_chat_schema.sql:46`). 다만 문서의 계획 SQL은 실제로 회귀를 만들 수 있음 (`docs/review-prompt.md:148`).  
- `#2 classify_message 비효율`: **과장 가능성 큼**. 현재 앱 코드엔 해당 함수 자체가 없음 (`src/lib/classifier.ts:57`).  
- `#3 70초 지연`: **중간→낮음(개인 프로젝트 기준)**. 실시간 제품이면 문제, 개인 비서면 허용 가능한 경우가 많음. 근거 설계는 문서에만 있음 (`docs/review-prompt.md:176`, `docs/progress.md:111`).  
- `#4 --dangerously-skip-permissions RCE`: **표현은 다소 강하지만 위험 자체는 큼**. 특히 텔레그램 같은 외부 입력을 받으면 프롬프트 인젝션 표면이 커집니다 (`docs/review-prompt.md:180`, `docs/progress.md:267`).  
- `#5 임베딩 모델 혼용`: **과장 아님, 핵심 리스크 맞음**. 문서상 Gemini+Fireworks 자동 전환이 명시되어 있음 (`docs/progress.md:90`).  
- `#6 pending_messages.json race`: **실제로 취약 가능성 높음**. 다중 프로세스 구조에서 파일 큐는 깨지기 쉬움 (`docs/review-prompt.md:177`).  
- `#7 대시보드 실시간성 부재`: **우선순위 낮음**. 현재 대시보드는 단순 fetch 구조 (`src/app/conversations/page.tsx:25`).

2) **1인 프로젝트 실용 TOP 5 수정 우선순위**
1. **임베딩 일관성 고정 (#5)**  
   - 단일 모델만 사용하거나, 모델별로 인덱스/컬럼/검색 경로를 완전 분리.
2. **파일 큐 제거 (#6)**  
   - `pending_messages.json` 대신 DB 큐 테이블 + row lock(`FOR UPDATE SKIP LOCKED`)로 전환.
3. **권한 우회 플래그 제거/격리 (#4)**  
   - `--dangerously-skip-permissions` 최소화, 실행 래퍼(허용 명령 allowlist) 도입.
4. **검색 함수 회귀 방지 (#1)**  
   - 마이그레이션 시 `chat_messages` 누락 방지 테스트 추가, 함수 변경 시 union 유지 검증.
5. **지연 개선은 필요할 때만 (#3)**  
   - 먼저 체감 측정 후, 불만이 있을 때만 이벤트 기반/주기 단축 적용.

`#2`와 `#7`은 지금 당장 고칠 “핵심 리스크”는 아닙니다.  
즉, Gemini가 꼽은 **#5, #6은 실제로 상위 우선순위가 맞고**, `#4`도 개인 프로젝트라도 외부 입력이 있으면 거의 같은 급으로 봐야 합니다.
