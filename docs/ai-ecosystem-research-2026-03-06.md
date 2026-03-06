# AI 생태계 리서치 결과 (2026-03-06)

> Secretary 프로젝트를 위한 통합 AI 게이트웨이/대화 수집/멀티모델 비교 조사.
> 4개 영역 병렬 리서치. 나중에 구현 시 참고용으로 상세히 기록.

---

## 1. 통합 AI 게이트웨이/허브

### 1-A. 채팅 UI (사용자가 직접 쓰는 프론트엔드)

#### Open WebUI (126K stars)
- GitHub: https://github.com/open-webui/open-webui
- 공식 문서: https://docs.openwebui.com/features/
- 자체호스팅 AI 플랫폼. Ollama + OpenAI 호환 API 모두 지원
- 핵심 기능:
  - **동시 멀티모델 병렬 응답** ("Concurrent Model Utilization", `@`로 모델 지정)
  - **Arena 모드** — 블라인드 A/B 테스트 + 개인 리더보드
  - **"Merge Responses in Many Model Chat"** 기능
  - 대화 내보내기: 전체 JSON, 개별 JSON/PDF/TXT
  - 대화 가져오기: ChatGPT/Claude/Grok 변환 스크립트 (써드파티, yetanotherchris/openwebui-importer)
  - 공식 네이티브 임포터는 미구현 (Issue #19457)
- DB: SQLite(기본) / PostgreSQL / PGVector. 벡터DB 9종(ChromaDB, Qdrant, Milvus, Elasticsearch 등)
- 클라우드 스토리지: S3, GCS, Azure Blob
- 프로바이더 연결: **OpenAI 호환 엔드포인트만** 지원. Claude/Gemini 직접 연결 불가 → OpenRouter 경유 필요
- 완전 오프라인 동작 가능

#### LibreChat (34.4K stars, MIT)
- GitHub: https://github.com/danny-avila/LibreChat
- 공식: https://www.librechat.ai
- ChatGPT 클론 중 가장 완성도 높음. ClickHouse에 인수됨
- **프로바이더 네이티브 직접 연결**: Anthropic, OpenAI, Google, Vertex AI, Azure, AWS Bedrock, Ollama, Groq, Mistral, OpenRouter, DeepSeek
- MongoDB 기반. OAuth2/LDAP 멀티유저
- MCP 지원. 350+ 기여자
- 멀티모델: `multiConvo: true` 설정으로 **여러 모델 병렬 스트리밍** 가능. "+" 입력으로 대화 추가. 단 UI 버그 보고됨 (Issue #4385)
- 메시지 포킹(Fork): 대화 특정 지점에서 분기, 다른 방향 탐색
- 대화 내보내기: screenshot, markdown, text, JSON
- 대화 가져오기: ChatGPT만. Claude/DeepSeek 미지원 (Issue #7696 요청 중)
- 2026 로드맵: Mixture-of-Agents 체인 에이전트, MCP 강화
  - https://www.librechat.ai/blog/2026-02-18_2026_roadmap

#### LobeChat (59.7K stars)
- GitHub: https://github.com/lobehub/lobe-chat
- 공식: https://lobehub.com
- Next.js 기반. 현대적 디자인. 원클릭 배포 (Vercel, Zeabur, Alibaba Cloud)
- 지원: OpenAI, Claude 4, Gemini, Ollama, DeepSeek, Qwen, Azure, Mistral, Perplexity, Bedrock
- Knowledge Base (RAG), 멀티모달, 100+ 플러그인
- CRDT 기술로 다기기 동기화
- 대화: 브라우저 로컬 또는 PostgreSQL 서버 DB
- **동시 멀티모델 쿼리: 확인 안 됨** — "Multi AI Providers"가 선택 전환인지 동시 전송인지 불명확
- Docker 자체호스팅 가능

#### AnythingLLM (54K stars)
- GitHub: https://github.com/Mintplex-Labs/anything-llm
- 데스크탑 + Docker 올인원. RAG + AI 에이전트 + No-code 에이전트 빌더 + MCP
- 30+ 프로바이더
- **치명적 제한**: 인스턴스당 하나의 LLM 프로바이더만 설정 가능 (Issue #698, 미구현)
- 동시 다중 모델 비교 불가

#### Jan.ai (40.9K stars)
- GitHub: https://github.com/janhq/jan
- 100% 오프라인 가능. 로컬 우선
- llama.cpp, ONNX, TensorRT-LLM 엔진
- OpenAI 호환 로컬 API (localhost:1337)
- 클라우드: OpenAI, Anthropic, Mistral, Groq, Gemini
- 대화 동기화 언급 있으나 구체적 메커니즘 불명확
- 동시 쿼리/내보내기 상세 미확인

#### Msty (클로즈드 소스)
- 공식: https://msty.ai / https://msty.app
- 데스크탑 앱. 로컬 + 클라우드
- **"Parallel Multiverse Chats"** — 여러 모델 응답 실시간 비교
- **"Split Chats"** — 같은 창에서 여러 모델 병렬 대화
- 가격: 개인 무료, Aurum $149/년 또는 평생 $349, Teams $300/user/년
- 클로즈드 소스, GitHub 없음

### 1-B. API 게이트웨이 (개발자용 프록시)

#### LiteLLM (38K stars, YC 지원)
- GitHub: https://github.com/BerriAI/litellm
- 공식: https://docs.litellm.ai
- 100+ LLM API를 OpenAI 포맷 단일 API로 통합
- 비용 추적, 가드레일, 로드밸런싱, 로깅
- 8ms P95 latency at 1K RPS
- Netflix, Lemonade, Rocket Money 프로덕션 사용
- PyPI 주간 다운로드 15,910,459건
- DB: PostgreSQL. Virtual Keys, Organizations, Teams, Users, Budgets, 토큰/비용 메타데이터
- **중요 버그**: `store_prompts_in_spend_logs: true` 활성화해도 messages/response 컬럼이 `{}`로 저장됨 (Issue #15641, v1.77.2)
- **우회**: 로깅 콜백(Langfuse, MLflow, Lunary, Helicone, Promptlayer, Traceloop, Slack)으로 외부 전송 가능
- 인터랙티브 채팅 REPL 없음. 순수 프록시.
- 설치: `pip install 'litellm[proxy]'`

#### OpenRouter (SaaS, $40M 시리즈 펀딩)
- 공식: https://openrouter.ai
- 500+ 모델, 60+ 프로바이더. 단일 API 키. 250k+ 앱, 4.2M+ 사용자
- 가격: 프로바이더 가격 그대로 pass-through, 마크업 없음. 토큰당 과금
- **대화 기본 미저장**. 옵트인 시 저장 가능하나, "inputs/outputs에 대한 취소 불가능한 상업적 사용권" 부여됨
- 웹 채팅에 사이드바이사이드 비교 기능 (2025-03 추가)
- 무료 모델 분당 20요청 한도
- 개인 비서용 대화 저장에는 부적절 (개인정보 양도 문제)

#### Portkey AI Gateway (10.2K stars)
- GitHub: https://github.com/Portkey-AI/gateway
- 200+ LLM 라우팅, 가드레일, 폴백, 자동 재시도, 로드밸런싱
- Gateway 2.0에서 엔터프라이즈 기능 오픈소스화
- 대화 저장 없음 (게이트웨이 레이어만)

#### RouteLLM (4.7K stars, LMSYS팀)
- GitHub: https://github.com/lm-sys/RouteLLM
- 쿼리 난이도에 따라 강한/약한 모델 자동 라우팅
- GPT-4 대비 85% 비용 절감, 95% 성능 유지
- OpenAI 클라이언트 drop-in replacement
- **마지막 커밋 2024-06. 사실상 비활성**

#### Cloudflare AI Gateway
- 공식: https://developers.cloudflare.com/ai-gateway/
- Cloudflare 엣지 기반. 350+ 모델
- 무료 티어: 월 100K 로그. 유료: 월 1M 로그
- **초과 시 로깅 멈춤 (데이터 유실)** — 대화 수집 목적으로 위험

#### Helicone AI Gateway
- GitHub: https://github.com/Helicone/ai-gateway
- Rust 기반 경량. 20+ 프로바이더. 완전 오픈소스
- 2025-05 셀프호스팅 공개

#### llmgateway (theopenco)
- GitHub: https://github.com/theopenco/llmgateway
- 19+ 프로바이더 통합 오픈소스 게이트웨이

### 1-C. 에그리게이터 클라우드 서비스

#### CollectivIQ
- ChatGPT, Claude, Gemini, Grok 포함 10+ LLM 동시 쿼리
- 응답 비교/검증/합성. "세계 최초 AI 합의 플랫폼" 표방
- 클라우드 서비스

#### Jenova
- GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, Grok 4.1 등 단일 구독
- unlimited conversation memory + 실시간 웹 검색
- 클라우드 서비스

---

## 2. CLI 멀티 AI 도구

### 주요 도구 비교

#### Aider (41.5K stars)
- GitHub: https://github.com/Aider-AI/aider
- AI 페어프로그래밍 최강. 13,102 커밋, 168 기여자
- 지원: Claude Sonnet 4/Opus 4, GPT-5/o1/o3/o4-mini, Gemini 2.5 Pro/Flash, DeepSeek R1/V3, Llama (Ollama), OpenRouter
- 인증: API Key 방식
- **대화 저장**: `.aider.chat.history.md` (CWD). `--chat-history-file` 또는 `AIDER_CHAT_HISTORY_FILE`로 경로 변경
- 추가 파일: `.aider.input.history`, `.aider.llm.history`
- MCP: PR 진행 중, 2025-08 기준 미완
- 주간 처리 토큰 15조+

#### Goose (27K stars, Block/Jack Dorsey)
- GitHub: https://github.com/block/goose
- 완전 모델 무관(model-agnostic) 설계
- MCP 서버 3000+ 연결 지원
- Claude, GPT-5, Gemini, Groq, OpenRouter
- 102회 릴리즈, 362 기여자
- 코딩 에이전트

#### Warp (26.1K stars)
- GitHub: https://github.com/warpdotdev/Warp
- **터미널 앱 자체가 여러 AI CLI를 동시에 실행**
- Claude Code, Codex CLI, Gemini CLI를 하나의 인터페이스에서 병렬
- 주간 릴리즈. Windows/macOS/Linux
- **클로즈드 소스 서버** (클라이언트만 오픈)

#### Crush (21K stars, Charm팀, 구 OpenCode)
- GitHub: https://github.com/charmbracelet/crush
- Go. TUI 기반 AI 코딩 에이전트
- **세션 중간 모델 전환(mid-session switching)**
- LSP + MCP 통합
- 지원: OpenAI, Anthropic, Google, Groq, Vercel AI Gateway, HuggingFace, Azure, Bedrock, Cerebras, OpenRouter, io.net 등
- 인증: 환경변수 API Key
- 설치: `brew install charmbracelet/tap/crush` 또는 `npm install -g @charmland/crush`

#### simonw/llm (11.3K stars)
- GitHub: https://github.com/simonw/llm
- 공식 문서: https://llm.datasette.io
- Simon Willison (Datasette 제작자)
- **핵심: 모든 대화를 SQLite에 자동 저장**
- 저장 위치: `~/.llm/logs.db` (기본). `LLM_USER_PATH`로 변경. `--database/-d`로 세션별 지정
- SQLite 스키마:
  - `conversations` 테이블
  - `responses` 테이블 (id, model, prompt, system, prompt_json, options_json, response, response_json, conversation_id, duration_ms, datetime_utc, token 정보)
  - `responses_fts` (FTS5 전문검색)
- 플러그인: llm-claude(Anthropic), llm-gemini, llm-openrouter, llm-ollama, llm-command-r 등 100+
- LLM 0.26 (2025-05): tools 지원 추가
- MCP: "MCP Registry" 언급. 상세 불명확
- 설치: `pip install llm` 또는 `brew install llm`

#### AIChat (9.5K stars)
- GitHub: https://github.com/sigoden/aichat
- Rust. All-in-one CLI: Shell Assistant, Chat-REPL, RAG, AI Tools & Agents
- 20+ provider: OpenAI, Claude, Gemini, Ollama, Groq, Azure-OpenAI, VertexAI, Bedrock, Github Models, Mistral, Deepseek, AI21, XAI Grok, Cohere, Perplexity, Cloudflare, OpenRouter, Ernie 등
- 세션 저장: YAML 형식. `save_session: true`. `AICHAT_SESSIONS_DIR` 환경변수
- 세션 압축: `compress_threshold: 4000`
- MCP 지원 있음

#### oh-my-claudecode (8.6K stars)
- GitHub: https://github.com/Yeachan-Heo/oh-my-claudecode
- Claude Code CLI 위 멀티에이전트 오케스트레이션 플러그인
- Claude(기본) + Codex(GPT) + Gemini를 tmux로 동시 구동
- 32 전문 에이전트, 37+ 스킬
- 라우팅:
  - `mcp__x__ask_codex` — 코드 분석, 아키텍처, 보안 검토
  - `mcp__g__ask_gemini` — UI/UX, 1M 컨텍스트
  - `/ccg` — 트리플 팬아웃 (Codex+Gemini 병렬 → Claude 종합)
  - `omc ask codex "..."` — 단일 경량 디스패치
  - `omc team N:codex|gemini "..."` — tmux pane 워커
- 기록: `.omc/state/token-tracking.jsonl`, `.omc/state/agent-replay-*.jsonl`, `.omc/artifacts/ask/`
- `omc cost daily|weekly|monthly` — 비용 리포트
- `omc sessions`, `omc backfill` — 세션 히스토리
- 비용: Claude Max + ChatGPT Pro + Gemini Pro ≈ $60/월

#### gptme (4.2K stars)
- GitHub: https://github.com/gptme/gptme
- 공식: https://gptme.org
- Claude Code 오픈소스 대안 포지셔닝
- Anthropic, OpenAI, Google, xAI, DeepSeek, OpenRouter(100+), llama.cpp
- 저장: `~/.local/share/gptme/logs/<date-description>/`. config.toml + 메시지 파일 (JSONL 추정)
- MCP: 강력 지원. "dynamically load MCP servers"

#### Agent-Deck (1.3K stars)
- GitHub: https://github.com/asheshgoplani/agent-deck
- AI 코딩 에이전트 TUI 세션 매니저
- Claude Code, Gemini CLI, OpenCode, Codex 세션 통합 관리
- MCP 서버 첨부/분리, Git worktree, Docker 샌드박스, 세션 포크
- 설치: `curl -fsSL https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/install.sh | bash`

#### mods (4.5K stars, Charm팀) — SUNSET 예정
- GitHub: https://github.com/charmbracelet/mods
- **2026-03-09 sunset/archive 예정. Crush로 이관**
- stdin → LLM → Markdown 출력
- MCP v1.8.0부터 지원
- 대화: SQLite. SHA-1 ID + 제목
- 지원: OpenAI(GPT-4 기본), Azure, Cohere, LocalAI, Groq, Gemini

#### shell_gpt / sgpt (11.9K stars)
- GitHub: https://github.com/TheR1D/shell_gpt
- Python. GPT-4/4o 기본. Ollama 가능
- 대화 캐시: `/tmp/shell_gpt/chat_cache` (기본). JSON. `CHAT_CACHE_LENGTH: 100`
- LiteLLM 통한 다른 provider 가능 (`USE_LITELLM` 설정)
- MCP 미지원

#### tgpt (3.1K stars)
- GitHub: https://github.com/aandrew-me/tgpt
- Go. API 키 없이 터미널 AI. Groq, KoboldAI, Ollama, OpenAI
- 대화 저장 없음. MCP 미지원

### CLI 도구별 대화 저장 경로/형식 상세

| CLI | 저장 경로 | 형식 | 주요 필드 |
|-----|----------|------|----------|
| **Claude Code** | `~/.claude/projects/<encoded-path>/<session-uuid>.jsonl` | JSONL | type, uuid, parentUuid, sessionId, message.role, message.content, isSidechain, isMeta, userType, cwd, gitBranch, timestamp(ISO8601), thinkingMetadata, requestId, agentId, message.usage(input/output/cache tokens), version |
| **Claude Code 인덱스** | `~/.claude/history.jsonl` | JSONL | display, pastedContents, timestamp(Unix ms), project |
| **Claude Code 설정** | `~/.claude.json` | JSON | 글로벌 설정, OAuth 상태, MCP 서버 |
| **Claude Code 통계** | `~/.claude/stats-cache.json` | JSON | 집계 사용량 |
| **Claude Code 태스크** | `~/.claude/todos/<session-id>-*.json` | JSON | 태스크 목록 |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL | environment_context(cwd), 대화 이벤트, timestamp, user prompt |
| **Codex CLI 설정** | `~/.codex/config.toml` | TOML | 설정 |
| **Gemini CLI** | `~/.gemini/tmp/<project_hash>/chats/` + `logs.json` | JSON | role(user/model), parts(메시지 내용). project_hash = SHA256(프로젝트 경로) |
| **Gemini CLI 수동 저장** | `/chat save <name>` → `checkpoint-<name>.json` | JSON 배열 | role, parts |
| **simonw/llm** | `~/.llm/logs.db` | SQLite | conversations, responses(model, prompt, system, response, duration_ms, datetime_utc, tokens), FTS5 |
| **AIChat** | `$AICHAT_SESSIONS_DIR/sessions/` | YAML | 세션 기반 |
| **Aider** | CWD의 `.aider.chat.history.md` | Markdown | 플레인 텍스트 |
| **gptme** | `~/.local/share/gptme/logs/<date-desc>/` | JSONL 추정 | config.toml + 메시지 |
| **mods** | XDG 경로 (추정 `~/.local/share/mods/`) | SQLite | conversations(id, title, updated_at, api, model) |
| **shell_gpt** | `/tmp/shell_gpt/chat_cache` | JSON | `CHAT_CACHE_LENGTH: 100` |

참고:
- Claude Code의 `costUSD` 필드는 v1.0.9 이후 제거됨. token 수로 외부 계산
- Gemini CLI의 대화 히스토리 export API 없음 (Issue #2554에서 요청 중)
- 프로그래밍 접근 예시: `grep '"type":"user"' ~/.claude/projects/$ENCODED/*.jsonl | jq -r '.message.content'`

### MCP 지원 현황

| CLI | MCP 지원 | 비고 |
|-----|---------|------|
| Claude Code | O (핵심 기능) | |
| Codex CLI | O | https://developers.openai.com/codex/mcp/ |
| Gemini CLI | O | ~/.gemini/settings.json에 설정 |
| gptme | O (강력) | 동적 MCP 서버 로드 |
| aichat | O | AI Tools & MCP |
| mods | O (v1.8.0~) | sunset 예정 |
| Crush | O | LSP + MCP |
| llm | 부분적 | 도구 통합 방식, 상세 불명확 |
| Aider | X (PR 진행 중) | 2025-08 기준 |
| shell_gpt | X | |
| tgpt | X | |

---

## 3. AI 토론/비교 플랫폼

### 3-A. 동시 전송 + 비교 도구

#### ChatALL (16.3K stars, Apache-2.0)
- GitHub: https://github.com/ai-shifu/ChatALL (구 sunner/ChatALL에서 이전)
- Electron 데스크탑 앱. **40+ AI 서비스에 동시 전송**
- ChatGPT, Claude, Gemini, Copilot, Llama, Falcon, Vicuna 등
- 로컬 대화 히스토리 저장. 다크모드, 멀티컬럼 뷰
- 최신 릴리즈 v1.85.110 (2025-05-22)
- 서버 불필요 (데스크탑 앱)

#### Poe (Quora) — 상용
- 공식: https://poe.com
- 200+ 모델 통합. 텍스트/이미지/비디오/오디오
- **멀티봇 그룹채팅** (2025-11): 200개 모델 + 200명 사용자 한 스레드
- @멘션으로 특정 모델 호출. `/compare` 명령어
- **개발자 API** (2025-07): OpenAI 호환 chat completion. 추가 토큰 $30/1M
- 가격: 무료 150msg/일, $5~$250/월
- 클로즈드, 자체호스팅 불가

#### ChatHub (10.4K stars, GPL-3.0)
- GitHub: https://github.com/chathub-dev/chathub
- 브라우저 확장 + 웹앱 + iOS/Android + Windows/Mac
- **최대 20+ 모델 동시 사이드바이사이드**
- GPT-5, Claude 4.5, Gemini 3, Llama 3.3 등
- 무료(2개 모델) / $19.99/월(20+). 자체 API 키 사용 시 무료
- 로컬 전체 텍스트 검색

#### OpenRouter Chat
- https://openrouter.ai/chat
- 2025-03 사이드바이사이드 모델 비교 기능 추가
- 두 모델 선택 → 동일 프롬프트 동시 전송
- https://x.com/OpenRouterAI/status/1904922319388041611

#### TypingMind
- 공식: https://www.typingmind.com
- 멀티모델 동시 응답. 50개 사전빌드 AI 에이전트
- 자체호스팅 커스텀 버전 있음 (typingmind.com/custom)
- 가격: 개인 라이센스 일회성, Teams $300/user/년

#### ChatLabs — 상용
- $5M 매출 (2025-09). 41명 팀
- 모델 비교 라이브 모드. 이미지 생성(SD, Flux, DALL-E)
- 무료 + $9.99/월~

#### Prompt Cannon
- https://promptcannon.com
- GPT-4, Claude, Gemini 등 동시 전송 비교. 웹 도구

#### nexos.ai
- https://nexos.ai/features/compare-ai-models/
- "Compare Models" 기능. Creandum(유럽 VC) 투자

#### multiple.chat
- 무료, 노로그인. ChatGPT, Claude, Gemini, Llama 사이드바이사이드
- 혼합 리뷰 ("모델 구식, 버그 있음" 지적)

### 3-B. AI 토론/디베이트 도구

#### Karpathy의 LLM Council (15.3K stars)
- GitHub: https://github.com/karpathy/llm-council
- **3단계 프로세스**:
  1. 여러 AI에게 개별 응답 수집
  2. 각 AI가 다른 AI의 응답을 **익명으로** 리뷰/랭킹 (브랜드 편향 방지)
  3. Chairman 모델이 최종 합성
- FastAPI(Python) + React + Vite. OpenRouter API 기반
- 자체 실행 가능. "주말 해킹"이라고 했지만 15.3K stars
- NAACL 2025: USMLE Step 1: 97%, Step 2 CK: 93%, Step 3: 94%. 초기 불일치 시 83% 수정 성공률
- VirtusLab 분석: https://virtuslab.com/blog/ai/llm-council
- 상용화: Council AI (council-ai.app), CouncilMind (councilmind.online)

#### LM Arena / Chatbot Arena (FastChat 39.4K stars)
- GitHub: https://github.com/lm-sys/FastChat
- https://arena.ai (2026-01 리브랜딩, 구 lmarena.ai)
- UC Berkeley LMSYS. 2025-04 Arena Intelligence Inc.로 스핀아웃
- $100M 시드 펀딩 (2025-05, a16z)
- 두 모델 블라인드 비교 + 투표. Elo 기반 리더보드
- 5M+ 투표, 70+ 모델
- "Max" 모델 라우터: 투표 데이터 기반 최적 모델 자동 선택
- FastChat으로 자체호스팅 가능

#### MassGen (825 stars, Apache 2.0)
- GitHub: https://github.com/massgen/MassGen
- 여러 AI가 동일 문제 병렬 처리 → 실시간 작업 요약 공유 → 수렴 감지 → 투표 합의
- "4x 속도" 향상 주장
- GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, Grok 4.1 등
- 최신 v0.1.59 (2026-03-04). 신생 프로젝트

#### DebateLLM (51 stars, Apache 2.0)
- GitHub: https://github.com/instadeepai/DebateLLM
- InstaDeep 연구용. 6가지 토론 프로토콜:
  - Society of Minds, Medprompt, Multi-Persona, Ensemble Refinement, ChatEval, Solo Performance Prompting
- MedQA, PubMedQA, MMLU 벤치마크
- 결론: "어떤 단일 토론 전략도 모든 시나리오에서 일관되게 우수하지 않다"

#### LLM-Agora (85 stars)
- GitHub: https://github.com/gauss5930/LLM-Agora
- 3개 에이전트 2라운드 토론 → ChatGPT 요약 → 합의
- **2023-09 이후 비활성**

#### AIDebator (csv610)
- GitHub: https://github.com/csv610/AIDebator
- litellm 통한 20+ 프로바이더. 학술 토론 형식. 품질 관리 + 증거 기반 스코어링

#### Deb8flow (LangGraph + GPT-4o)
- Pro/Con 에이전트 + Moderator + 팩트체커 + Judge 구성
- https://towardsdatascience.com/deb8flow-orchestrating-autonomous-ai-debates-with-langgraph-and-gpt-4o/

#### Multiagent Debate (MIT, ICML 2024)
- GitHub: https://github.com/composable-models/llm_multiagent_debate
- https://composable-models.github.io/llm_debate/
- 여러 LLM 인스턴스가 다수 라운드 토론 → 수학적 추론/사실 검증 크게 향상

#### DMAD (ICLR 2025)
- GitHub: https://github.com/MraDonkey/DMAD
- 에이전트별 다른 추론 방식 강제 → 집단사고 탈피
- **반론**: "현재 MAD 방법들은 더 많은 컴퓨팅을 써도 단순 단일 에이전트보다 일관되게 낫지 않다"

#### FlagEval Debate (BAAI)
- https://huggingface.co/blog/debate
- 동적 LLM 평가 방법론. 중국어, 영어, 한국어, 아랍어 4개 언어

### 3-C. 에이전트 간 통신 표준 (2025년 등장)

| 프로토콜 | 주도 | 용도 | 파트너 |
|---------|------|------|--------|
| **MCP** | Anthropic (2024-11) | 에이전트 ↔ 도구 | 업계 표준화 중 |
| **A2A** | Google (2025-04-09) | **에이전트 ↔ 에이전트** | Atlassian, Box, LangChain, MongoDB, PayPal, Salesforce, SAP, ServiceNow, Workday 등 50+ |
| **ACP** | IBM/Linux Foundation | RESTful HTTP 에이전트 통신 | |
| **ANP** | Agent Network Protocol | 분산 에이전트 네트워크 | |

- A2A 보안 가이드: https://semgrep.dev/blog/2025/a-security-engineers-guide-to-the-a2a-protocol/
- 프로토콜 비교: https://arxiv.org/html/2505.02279v1

### 3-D. 학술 연구 결론 (상충)

**긍정적:**
- ICML 2024 (MIT): 멀티 에이전트 토론이 수학적 추론과 사실성을 크게 향상
- NAACL 2025: LLM Council이 의학 시험에서 97%/93%/94% 달성
- 2024-11 Quanta Magazine: "Debate May Help AI Models Converge on Truth"

**부정적:**
- ICLR 2025 (DMAD): "현재 MAD 방법들은 단순 단일 에이전트보다 일관되게 낫지 않다"
- DebateLLM (InstaDeep): "어떤 단일 전략도 모든 시나리오에서 우수하지 않다"

**종합 판단**: 정답 수렴 목적의 토론은 아직 불확실. 다양한 관점 수집/비교 목적으로는 유효.

---

## 4. AI 대화 내보내기

### 공식 Export

| 서비스 | 방법 | 형식 | 자동화 |
|--------|------|------|--------|
| ChatGPT | Settings → Export all data | JSON (이메일 다운로드 링크) | 낮음 (수동) |
| Claude.ai | **공식 없음** | 수동 복사만 | 거의 없음 |
| Gemini Web | Google Takeout | HTML/JSON | 낮음 (수동) |
| Grok | **없음** | - | 없음 |

### 서드파티 도구

#### NousSave (Chrome 확장)
- ChatGPT, Claude, Gemini → Markdown/JSON
- 가장 범용적

#### SaveYourChat (Chrome 확장)
- ChatGPT + Gemini → PDF/Markdown/HTML

#### AI Exporter Hub
- 멀티플랫폼. Claude.ai 포함

### 대화 수집 도구 (CLI 로컬 파일 대상)

#### CTK - Conversation Toolkit
- 블로그: https://metafunctor.com/post/2025-10-ctk/
- **ChatGPT, Claude, Copilot, Gemini, 로컬 LLM(Ollama), Cursor/Windsurf 대화를 하나의 SQLite DB에 통합**
- 트리 구조 저장. JSON/JSONL, Markdown, HTML5 export
- TUI 인터페이스
- 정확히 Secretary의 "모든 AI 대화 수집" 목적과 일치
- 채택 신호 미확인

#### entire (3.4K stars)
- GitHub: https://github.com/entireio/cli
- **git hook 기반 AI 세션 자동 캡처**
- Claude Code, Gemini CLI, OpenCode, Cursor 지원
- git 별도 브랜치(`entire/checkpoints/v1`)에 JSON 저장
- 자동 secret 필터링

#### ccusage (11.3K stars)
- GitHub: https://github.com/ryoppippi/ccusage
- Claude Code + Codex CLI JSONL에서 **토큰 사용량/비용 분석**
- npm 패키지. v18.0.8 (2026-02-24)
- Claude Code(`~/.claude/projects/`)와 Codex(`~/.codex/sessions/`) 모두 읽음
- 대화 내용이 아닌 usage 분석 특화

#### 기타 Claude Code 분석 도구
- claude-code-transcripts (simonw): https://github.com/simonw/claude-code-transcripts
- claude-JSONL-browser (withLinda): https://github.com/withLinda/claude-JSONL-browser
- claude-code-log (daaain): https://github.com/daaain/claude-code-log
- clog (HillviewCap): https://github.com/HillviewCap/clog

### OpenRouter CLI 도구들

| 도구 | GitHub | 특징 |
|------|--------|------|
| OrChat | github.com/oop7/OrChat | 스트리밍, 토큰 추적, 에이전틱 셸 |
| openrouter-cli (PyPI) | pypi.org/project/openrouter-cli | pip 설치, 인터랙티브 |
| ort (Rust) | github.com/grahamking/ort | tmux 지원 |
| openrouter-cli (Knox) | github.com/knoxai/openrouter-cli | 파일시스템 도구 통합 |

---

## 5. 종합 분석

### 이미 존재하는 것
- 통합 채팅 UI (Open WebUI 126K, LibreChat 34K, LobeChat 60K)
- API 게이트웨이 (LiteLLM 38K, OpenRouter 500+ 모델)
- 동시 비교 (ChatALL 16K, ChatHub 10K, Poe)
- AI 토론 (LLM Council 15K, MassGen)
- 대화 수집기 (CTK, entire 3.4K)
- 사용량 분석 (ccusage 11.3K)
- 에이전트 통신 표준 (MCP, A2A, ACP, ANP)

### 아직 아무도 안 한 것 (Secretary의 차별점)
1. 대화 수집 + **비서 기능**(태스크/시간추적/리뷰) 통합
2. 수집된 대화를 **벡터 DB에 넣어서 맥락 참조** (영구 기억)
3. AI 토론 결과를 **지식으로 축적** (원샷이 아닌 누적 학습)
4. **텔레그램 + 웹 + CLI** 통합 입력
5. **PC + 모바일 활동 추적** 통합

### 쓸 것 vs 만들 것 판단

| 영역 | 판단 | 이유 |
|------|------|------|
| AI Gateway | LiteLLM **사용** | 엔터프라이즈 검증, 100+ 프로바이더 |
| 대화 수집 | **직접 구축** (CTK/entire 참고) | Supabase 타겟 + Secretary 스키마 |
| 채팅 UI | **직접 구축** | 비서 기능 통합 필요 |
| 멀티모델 비교 | **직접 구축** (LLM Council 패턴) | Secretary에 내장 |
| 활동 추적 | **직접 구축** (기존 유지) | activity_tracker.ps1 + Google API |
| 벡터 검색 | pgvector **사용** (기존 유지) | 이미 Supabase에서 사용 중 |
| 프론트엔드 | **직접 구축** | 제로베이스 리디자인 결정됨 |

### 구현 우선순위 제안

```
Phase 1: 대화 수집 인프라
  - Conversation Collector 데몬 (Claude Code, Gemini CLI, Codex CLI)
  - Supabase conversations/messages 스키마
  - 웹 UI 임포트 (ChatGPT JSON 등)
  - History 메뉴에 통합 타임라인

Phase 2: AI Gateway
  - LiteLLM Proxy 셀프호스팅
  - 커스텀 로깅 콜백 → Supabase
  - Secretary worker → LiteLLM 경유
  - 멀티 프로바이더 라우팅

Phase 3: 멀티모델 기능
  - 동시 질의 (LiteLLM → N개 모델 병렬)
  - LLM Council 패턴 (합의 도출)
  - 토론 결과 벡터 DB 저장
  - 멀티모델 비교 뷰

Phase 4: 프론트엔드 리디자인
  - 6메뉴 제로베이스 설계
  - 토스 디자인 시스템 적용
```

---

## 6. 미조사 영역 (향후 필요 시 조사)

1. **AI 메모리/지식 관리** — Mem0, Letta(MemGPT). 장기 기억 시스템
2. **워크플로우 자동화** — n8n, Dify, Flowise. AI 작업 체이닝
3. **A2A 프로토콜 상세** — Google 주도 에이전트간 통신
4. **모바일 데이터 수집** — Google Digital Wellbeing, Maps Timeline, Fit API
5. **LobeChat 동시 멀티모델** — 공식 문서에서 미확인
6. **LiteLLM store_prompts 버그 수정 여부** — 최신 버전 패치 상태
7. **CTK의 Claude Code/Gemini CLI 직접 지원 여부**
