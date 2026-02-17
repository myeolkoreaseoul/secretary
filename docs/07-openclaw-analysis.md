# OpenClaw 분석 + Secretary 통합 가능성

## OpenClaw이란?

- **GitHub**: https://github.com/openclaw/openclaw (15만+ ⭐, 2026년 2월 기준)
- **공식 사이트**: https://openclaw.ai/
- **문서**: https://docs.openclaw.ai/
- 원래 이름: Clawdbot → Moltbot → OpenClaw (Anthropic 상표 문제로 개명)
- 만든 사람: Peter Steinberger (PSPDFKit 창업자, 2026-02-14 OpenAI 합류 발표)
- 라이선스: **MIT** (핵심 Gateway)

## 핵심: "눈과 손이 있는 AI"

일반 챗봇: 말만 함
OpenClaw: **웹 브라우징 + 파일 읽기/쓰기 + 셸 명령 실행** 가능

### 주요 기능
- 자율 작업 실행 (비행기 체크인, 메일 정리, 차량 구매 등)
- 다채널 메시징: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, 웹챗 등
- 브라우저 자동화 (웹 탐색, 폼 입력, 사이트 상호작용)
- 파일 시스템 접근 (읽기/쓰기/관리)
- 셸 명령 실행
- 음성 지원 (macOS/iOS/Android)
- Canvas (에이전트가 제어하는 비주얼 워크스페이스)
- **100+ 사전 구성 AgentSkills**

## 기술 스택

| 항목 | 내용 |
|------|------|
| 런타임 | **Node.js >= 22** |
| 언어 | **TypeScript** |
| 패키지 매니저 | pnpm (또는 Bun) |
| 아키텍처 | Hub-and-spoke (중앙 Gateway) |
| 통신 | **WebSocket** (기본 포트 18789) |
| LLM 지원 | **Claude, GPT, Gemini, DeepSeek** 등 |
| 플러그인 | 4가지: Channel, Tool, Provider, Memory |
| npm 패키지 | `openclaw` |

## 아키텍처

```
사용자 → [채널] → [Gateway:18789] → [Agent Runtime] → [LLM + Tools]
                      ↕                     ↕
                   [Memory]            [Browser/Shell/Files]
```

1. 사용자가 채널(웹, WhatsApp 등)로 메시지 전송
2. Gateway가 Agent Runtime으로 라우팅
3. Agent Runtime이 LLM 호출 + 도구 실행
4. 결과를 사용자에게 반환

## Tool / Function Calling

- **도구(Tool)는 1급 시민** — JSON 스키마로 정의, 에이전트가 자동 호출
- 25+ 내장 도구, 53+ 스킬
- 공식 문서: https://docs.openclaw.ai/tools
- **"Tools are organs, Skills are textbooks"**
  - Tool: 무엇을 **할 수 있는지** (능력)
  - Skill: 어떻게 **조합하는지** (지식)
- AgentSkills 형식은 Claude Code, Cursor 등과 호환

## Secretary 프로젝트와 통합 방법

### 방법 A: OpenClaw를 에이전트 백엔드로 사용

```
┌─ Secretary (Next.js) ─────────────────┐
│                                       │
│  채팅 UI → WebSocket → OpenClaw Gateway
│                           ↓
│                      Agent Runtime
│                        ├─ LLM: Claude (Max 구독?)
│                        ├─ Tool: 분류/조언
│                        ├─ Tool: 벡터 검색
│                        ├─ Tool: 시간 추적
│                        ├─ Tool: 웹 검색
│                        └─ Tool: 일정/예약
│                                       │
│  Daily Report UI ← DB ← 시간 추적 결과  │
└───────────────────────────────────────┘
```

**장점:**
- 에이전틱 기능이 이미 다 구현됨
- 브라우저 자동화, 셸 명령, 파일 접근 즉시 사용
- 도구 추가가 쉬움 (Plugin SDK)
- WhatsApp/Telegram 등으로도 접근 가능

**단점:**
- OpenClaw Gateway를 별도로 띄워야 함 (포트 18789)
- 학습 곡선
- Secretary의 기존 코드와 구조가 많이 달라짐
- OpenClaw이 Claude API 키를 요구할 수 있음 (Max 구독 CLI가 아닌)

### 방법 B: OpenClaw의 개념만 차용, 직접 구현

```
Secretary (Next.js)
  ├─ 채팅 UI (직접 구현)
  ├─ AI: Claude CLI (Max 구독)
  ├─ 도구 시스템: 직접 구현 (Tool 인터페이스)
  │    ├─ classify_tool: 분류/조언
  │    ├─ search_tool: 벡터 검색
  │    ├─ time_tool: 시간 기록
  │    ├─ web_tool: 웹 검색
  │    └─ schedule_tool: 일정 관리
  └─ 시간 추적 데몬 (크론잡)
```

**장점:**
- Claude Max 구독 CLI 직접 활용 (API 키 불필요)
- 기존 코드 재활용 가능
- 완전한 컨트롤

**단점:**
- 에이전틱 기능을 처음부터 직접 구현해야 함
- 브라우저 자동화 등은 별도 구현 필요

### 방법 C: 하이브리드 — OpenClaw + Claude CLI

```
Secretary (Next.js) — 채팅 UI, Daily Report
     ↓
OpenClaw Gateway — 에이전틱 작업 라우팅
     ↓
Claude CLI (Max 구독) — AI 두뇌로 연결?
     또는
Claude API — OpenClaw의 Provider로 설정
```

**핵심 질문:** OpenClaw이 Claude Max 구독(CLI)을 LLM으로 쓸 수 있는가?
- OpenClaw의 Provider는 API 키 기반으로 설계됨
- Claude CLI를 Provider로 연결하려면 커스텀 Provider 플러그인 필요
- 또는 Gemini/GPT를 OpenClaw의 LLM으로 쓰고, Claude CLI는 별도로

## 확인이 필요한 사항

1. **OpenClaw이 Claude API 키 없이 Claude Max 구독을 쓸 수 있는가?**
   - Provider 플러그인에서 `claude --print`를 호출하는 커스텀 Provider 구현 가능?
2. **OpenClaw Studio(Next.js)가 Secretary UI를 대체할 수 있는가?**
   - https://github.com/grp06/openclaw-studio
3. **OpenClaw의 Memory 시스템이 pgvector를 지원하는가?**
   - 커스텀 Memory 플러그인으로 Supabase pgvector 연결?
4. **시간 추적을 OpenClaw Tool로 구현 가능한가?**
   - 크론잡 대신 OpenClaw의 scheduled task 기능?

## 보안 주의사항

- OpenClaw은 **셸 접근 + 파일 시스템 접근**이 가능 — 보안 위험
- CrowdStrike, BitSight 등이 보안 우려 발표
- 자율성 수준 설정 가능 (어떤 도구 허용할지 제한)
- matplotlib PR 사건: 에이전트가 자율적으로 보복 블로그 포스트 작성 → 자율성 제어 중요

## 관련 리소스

- OpenClaw GitHub: https://github.com/openclaw/openclaw
- OpenClaw Docs: https://docs.openclaw.ai/
- OpenClaw Studio: https://github.com/grp06/openclaw-studio
- OpenClaw npm: https://www.npmjs.com/package/openclaw
- Tools Docs: https://docs.openclaw.ai/tools
- Skills: https://github.com/VoltAgent/awesome-openclaw-skills
- Architecture: https://collabnix.com/openclaw-architecture-deep-dive-how-it-works-under-the-hood/
