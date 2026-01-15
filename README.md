# Secretary - AI 비서 & 전문가 팀 통합 시스템

## 📋 프로젝트 개요

여러 AI(Claude, Gemini, Grok, GPT)와의 대화를 통합 관리하고, AI 간 맥락을 공유하는 시스템.

### 핵심 기능
- 🤵 **비서 시스템**: Claude를 기본 비서로, 다른 AI로 교체 가능
- 👥 **전문가 팀**: Claude(CTO), Gemini(총무), Grok(마케팅), GPT(홍보)
- 🔍 **맥락 검색**: 과거 대화 검색 후 다른 AI에 맥락 전달
- 📅 **일일 아카이브**: 매일 자동 정리

---

## 🏗️ 기술 스택

| 구성요소 | 기술 |
|---------|------|
| 프론트엔드 | Next.js 16 + TypeScript + Tailwind CSS |
| 백엔드/DB | Supabase (PostgreSQL) |
| 배포 | Vercel |

---

## ✅ 완료된 작업 (2026-01-15)

- [x] Supabase 프로젝트 생성 + 테이블 설계
- [x] Next.js 프로젝트 생성
- [x] Supabase 연동 설정
- [x] 대시보드 UI 구현
- [x] 파일 업로드 UI 구현
- [x] 맥락 프롬프트 생성 UI 구현
- [x] 일일 아카이브 UI 구현
- [x] GitHub 푸시
- [x] Vercel 배포 설정 (404 에러 발생 중 - 확인 필요)

---

## ⏳ 남은 작업

### 1. Vercel 404 에러 해결
- Vercel 대시보드에서 배포 상태 확인
- 재배포 필요할 수 있음

### 2. Supabase 실제 저장 연동
파일 업로드 시 실제로 DB에 저장되도록 수정 필요

### 3. 벡터 검색 (pgvector)
의미 기반 검색을 위한 pgvector 확장 설정

### 4. 실제 데이터 연동
대시보드, 아카이브에 Supabase에서 데이터 가져오기

---

## 🔑 환경 변수

### Vercel에 설정됨:
```
NEXT_PUBLIC_SUPABASE_URL=https://mwahabvsteokswykikgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_KYF2KP8Vf0xotlEzBwCGIw_DdaEhs1W
```

### 로컬 개발 시:
`~/secretary/.env.local` 파일에 위 내용 저장됨

---

## 🗄️ Supabase 테이블 구조

### conversations
```sql
- id: UUID (PK)
- ai_source: TEXT (claude, gemini, grok, gpt)
- role: TEXT (secretary, cto, marketing, admin, pr)
- title: TEXT
- content: TEXT
- summary: TEXT
- tags: TEXT[]
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

### daily_archives
```sql
- id: UUID (PK)
- date: DATE (UNIQUE)
- summary: TEXT
- todos: JSONB
- ideas: TEXT[]
- timeline: JSONB
- created_at: TIMESTAMPTZ
```

---

## 🚀 로컬 개발 방법

```bash
cd ~/secretary
npm install
npm run dev
# http://localhost:3000 접속
```

---

## 📁 프로젝트 구조

```
~/secretary/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── Dashboard.tsx       # 오늘의 현황
│   │   ├── SecretarySection.tsx # 비서 섹션
│   │   ├── SearchSection.tsx   # 검색 & 맥락 프롬프트
│   │   ├── FileUpload.tsx      # 파일 업로드
│   │   ├── ExpertLinks.tsx     # 전문가 바로가기
│   │   └── ArchiveSection.tsx  # 일일 아카이브
│   ├── lib/
│   │   └── supabase.ts         # Supabase 클라이언트
│   └── types/
│       └── database.ts         # 타입 정의
├── .env.local                  # 환경 변수 (git 제외)
└── package.json
```

---

## 🔗 관련 링크

- GitHub: https://github.com/myeolkoreaseoul/secretary
- Supabase: https://supabase.com/dashboard/project/mwahabvsteokswykikgh
- Vercel: https://vercel.com (프로젝트 대시보드에서 확인)

---

## 📝 다음에 이어서 할 때

1. Vercel 대시보드에서 배포 상태 확인 & 재배포
2. 404 해결 후 사이트 테스트
3. Supabase 저장 기능 구현
4. 벡터 검색 추가 (선택)

---

## ⚠️ 보안 주의

- GitHub 토큰이 채팅에 노출됨 → https://github.com/settings/tokens 에서 삭제 필요!
- `.env.local`은 git에 포함되지 않음 (정상)
