# AI Secretary v2 — 프로젝트 진행 현황

> 최종 업데이트: 2026-03-06

---

## 2026-03-06: AI 생태계 리서치 + 제로베이스 리디자인 준비
- AI 생태계 4개 영역 병렬 리서치 완료 → docs/ai-ecosystem-research-2026-03-06.md (579줄)
  - 통합 게이트웨이: Open WebUI(126K), LiteLLM(38K), LibreChat(34K) 등
  - CLI 도구: Aider(41.5K), simonw/llm(11.3K) 등 + 각 CLI 저장 경로/스키마 정리
  - AI 토론: LLM Council(Karpathy, 15.3K), ChatALL(16.3K), Arena 등
  - 대화 수집: CTK, entire(3.4K), ccusage(11.3K) 발견
- 비전 확장: "모든 AI 대화 수집" → 통합 AI Gateway + Conversation Collector 아키텍처 도출
- 에이전트 통신 표준 조사: MCP(Anthropic), A2A(Google), ACP(IBM), ANP

## 2026-03-06: 프론트엔드 제로베이스 리디자인 준비
- docs/ 정리: 초기 분석/리뷰 문서 21개를 docs/archive/로 이동, 핵심 4개만 루트 유지
- 프로덕트 토론 진행: 메뉴 구조 재정의
  - 입력 3채널: CLI(secretary 전용) / 텔레그램 / 웹 /chat — 모두 DB 저장
  - 출력 6메뉴: Dashboard / Tasks / Time / History / Scouter(아이디어+YT통합) / Settings
- 트래킹 3레이어 정의: 작업물(work-log, 작동중) / PC활동(미가동) / 모바일(Google서비스, 미구현)
- 이전 토스 리디자인(b7e3b80)은 실패 — 구조가 아닌 색상만 바꿔서 폐기 결정

---

## 1. 프로젝트 개요

기존 `/home/john/projects/secretary` (Next.js + Supabase + Gemini)를 **채팅형 AI 비서**로 전면 업그레이드.

### 핵심 요구사항 5가지

| # | 요구사항 | 상태 |
|---|---------|------|
| 1 | 아무 말 → 자동 분류(7개+) + AI 조언 | ✅ 구현 완료 |
| 2 | 영구 기억 + 벡터 검색으로 과거 맥락 자동 참조 | ✅ 구현 완료 |
| 3 | 에이전틱 실행 (MCP 서버) | ✅ 구현 완료 |
| 4 | 시간 추적 — 24시간 Daily Report | ✅ 구현 완료 |
| 5 | 웹 대시보드 — 카테고리별 지식 관리 | ✅ 구현 완료 |

---

## 2. 아키텍처 (수정 후 확정)

### 핵심 변경사항 (크로스 검증 결과)
| 변경 전 | 변경 후 | 이유 |
|---------|---------|------|
| pending_messages.json (파일 큐) | PostgreSQL message_queue 테이블 | 레이스 컨디션 방지 |
| --dangerously-skip-permissions 기본 | MCP Server 우선 + fallback | 보안 강화 |
| 3프로세스 (listener+executor+timer) | 2프로세스 (listener+worker) | 단순화 |
| Fireworks 폴백 임베딩 | Gemini 전용 + 3x 재시도 | 모델 혼합 방지 |
| TIMESTAMP | TIMESTAMPTZ | 타임존 안전 |
| UNIQUE(telegram_message_id) | UNIQUE(chat_id, telegram_message_id) | 그룹채팅 대비 |

### AI 엔진
| 역할 | 기술 |
|------|------|
| 두뇌 (추론+답변+분류+조언) | **Claude CLI (Max 구독, 무제한)** |
| 임베딩 전용 | **Gemini text-embedding-004** (768차원) |
| 도구 호출 | **MCP Server** (Python mcp 패키지) |

### 프로세스 구조
```
secretary-listener.service  ← telegram_listener.py (상시, 메시지→DB큐)
secretary-worker.service    ← worker.py (상시, DB큐→Claude CLI+MCP)
```

---

## 3. 구현 진행 상황

### Phase 1A: 텔레그램 + Claude CLI (핵심) — ✅ 완료
| # | 파일 | 상태 |
|---|------|------|
| 1 | `supabase/migrations/003_v2_schema.sql` | ✅ |
| 2 | `bot/__init__.py` | ✅ |
| 3 | `bot/config.py` | ✅ |
| 4 | `bot/requirements.txt` | ✅ |
| 5 | `bot/.env` | ✅ |
| 6 | `bot/mcp.json` | ✅ |
| 7 | `bot/supabase_client.py` | ✅ |
| 8 | `bot/embedding.py` | ✅ |
| 9 | `bot/telegram_sender.py` | ✅ |
| 10 | `bot/mcp_server.py` | ✅ |
| 11 | `bot/telegram_listener.py` | ✅ |
| 12 | `bot/worker.py` | ✅ |
| 13 | `bot/CLAUDE.md` | ✅ |
| 14 | `deploy/secretary-listener.service` | ✅ |
| 15 | `deploy/secretary-worker.service` | ✅ |

### Phase 1B: 벡터 메모리 + 백필 — ✅ 완료
| # | 파일 | 상태 |
|---|------|------|
| 1 | `scripts/backfill_embeddings.py` | ✅ |

### Phase 1C: 웹 대시보드 — ✅ 완료
| # | 파일 | 상태 |
|---|------|------|
| 0 | shadcn/ui 수동 초기화 + 컴포넌트 7개 | ✅ |
| 1 | `src/lib/utils.ts` | ✅ |
| 2 | `src/lib/supabase-admin.ts` | ✅ |
| 3 | `src/types/index.ts` (새 타입 추가) | ✅ |
| 4 | `src/app/layout.tsx` (사이드바+다크모드) | ✅ |
| 5 | `src/app/page.tsx` (/categories 리다이렉트) | ✅ |
| 6 | `src/app/globals.css` (shadcn CSS 변수) | ✅ |
| 7 | `src/app/categories/page.tsx` + `client.tsx` | ✅ |
| 8 | `src/app/history/page.tsx` | ✅ |
| 9 | `src/app/todos/page.tsx` | ✅ |
| 10 | `src/app/time/page.tsx` | ✅ |
| 11 | `src/app/settings/page.tsx` | ✅ |
| 12 | `src/app/api/history/route.ts` | ✅ |
| 13 | `src/app/api/todos/route.ts` | ✅ |
| 14 | `src/app/api/time/route.ts` | ✅ |
| 15 | `src/app/api/categories/[id]/route.ts` | ✅ |
| 16 | `src/app/api/summary/route.ts` | ✅ |
| 17 | `src/components/ui/button.tsx` | ✅ |
| 18 | `src/components/ui/input.tsx` | ✅ |
| 19 | `src/components/ui/badge.tsx` | ✅ |
| 20 | `src/components/ui/card.tsx` | ✅ |
| 21 | `src/components/ui/separator.tsx` | ✅ |
| 22 | `src/components/ui/tabs.tsx` | ✅ |
| 23 | `src/components/ui/skeleton.tsx` | ✅ |
| 24 | `src/components/TimeGrid.tsx` | ✅ |
| 25 | `components.json` | ✅ |

### Phase 1D: 시간 추적 — ✅ 완료
| # | 파일 | 상태 |
|---|------|------|
| 1 | `scripts/activity_tracker.ps1` | ✅ |
| 2 | `scripts/aggregate_hourly.py` | ✅ |
| 3 | `scripts/daily_report.py` | ✅ |

### 수정된 기존 파일
| 파일 | 변경 | 상태 |
|------|------|------|
| `.gitignore` | bot/.env, bot/logs/, *.lock, __pycache__ 추가 | ✅ |
| `.env.local` | SUPABASE_SERVICE_KEY 추가 | ✅ |

### 빌드 검증
- `next build` ✅ 성공 (2026-02-16)

---

## 4. 배포 전 남은 작업 (사용자 수행)

### 4-1. Supabase SQL 실행
```sql
-- Supabase SQL Editor에서 003_v2_schema.sql 실행
```

### 4-2. 환경변수 설정
```bash
# bot/.env — 텔레그램 봇 토큰, Supabase service_role 키 등 입력
# .env.local — SUPABASE_SERVICE_KEY 값 입력
```

### 4-3. Python 의존성 설치
```bash
cd ~/projects/secretary/bot
pip install -r requirements.txt
```

### 4-4. systemd 서비스 등록 (맥북 서버)
```bash
sudo cp deploy/secretary-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable secretary-listener secretary-worker
sudo systemctl start secretary-listener secretary-worker
```

### 4-5. 임베딩 백필 (기존 데이터)
```bash
cd ~/projects/secretary
python -m scripts.backfill_embeddings
```

### 4-6. Windows 활동 추적 설정
```powershell
# 환경변수 설정: SUPABASE_URL, SUPABASE_SERVICE_KEY
# Task Scheduler 등록 또는 직접 실행
.\scripts\activity_tracker.ps1
```

### 4-7. cron 등록 (맥북)
```bash
crontab -e
# 매시간 집계
0 * * * * cd ~/projects/secretary && python -m scripts.aggregate_hourly
# 매일 7시 Daily Report
0 7 * * * cd ~/projects/secretary && python -m scripts.daily_report
```

---

## 5. Phase 2 (미래)
- [ ] 자주 쓰는 작업 스크립트
- [ ] 브라우저 자동화 (Playwright)
- [ ] 승인 플로우 (AI 제안 → 유저 확인 → 실행)
- [ ] Cloudflare Tunnel 설정
