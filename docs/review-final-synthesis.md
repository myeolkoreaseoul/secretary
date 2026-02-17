# AI Secretary v2 — 3-AI 교차 검증 최종 종합

> 날짜: 2026-02-16
> 검증 도구: Claude Opus 4.6 + Codex gpt-5.3-codex + Gemini 3 Pro Preview

---

## 3개 AI의 TOP 5 비교

| 순위 | Codex (gpt-5.3-codex) | Gemini (3-pro-preview) | Claude (본 분석) |
|------|----------------------|----------------------|-----------------|
| 1 | pending_messages.json 제거 → DB 큐 | 동시성 큐 도입 (같음) | pending_messages.json atomic write |
| 2 | telegram_message_id UNIQUE 수정 | 스키마 통합 (chat_messages + telegram 합치기) | search_similar_content 회귀 수정 |
| 3 | search_similar_content 회귀 방지 | 임베딩 폴백 전략 폐기 | TIMESTAMPTZ 사용 |
| 4 | --dangerously-skip-permissions 격리 | Deadlock 방지 (try-finally) | msg_id 타입 UUID 확정 |
| 5 | 임베딩 단일화 정책 확정 | 프롬프트 인젝션 방어 | 현재 설계 유지 가능 항목 확인 |

---

## 3개 AI 모두 합의한 이슈 (반드시 수정)

### 🔴 1. `pending_messages.json` Race Condition
- **합의도: 3/3** (Codex 🔴, Gemini 🔴, Claude 인정)
- **조치**: atomic write (tmp+rename) 패턴 적용. 소놀봇도 동일 패턴 사용했으므로 구현 간단.
- DB 큐로 전환은 과설계. 파일 기반 + atomic write로 충분 (1인 프로젝트).

### 🔴 2. `search_similar_content` 함수 회귀
- **합의도: 3/3** (Codex 🔴, Gemini 🔴, Claude 인정)
- **조치**: 003 마이그레이션에서 `chat_messages` UNION ALL 유지.
  ```sql
  -- telegram_messages + chat_messages + thoughts 모두 포함
  ```

### 🔴 3. 임베딩 모델 혼용 문제
- **합의도: 3/3** (Codex 🔴, Gemini 🔴, Claude 부분 인정)
- **조치**: Gemini 단일 모델 고정. 폴백은 "재시도 3회 + 실패 시 임베딩 NULL 저장 + 나중에 백필"
- Fireworks 폴백은 제거하되, 비상용으로 코드만 남겨두고 **자동 전환은 비활성화**

---

## 2개 AI 합의 (권장 수정)

### 🟡 4. `telegram_message_id` UNIQUE 제약 수정
- **Codex 전용 발견** (Gemini, Claude 미발견)
- **타당성**: 텔레그램 message_id는 chat 단위이므로 전역 UNIQUE는 충돌 가능
- **조치**: `UNIQUE(chat_id, telegram_message_id)` 복합 유니크로 변경

### 🟡 5. `--dangerously-skip-permissions` 보안
- **합의도: 3/3** (모두 지적)
- **현실**: 소놀봇도 동일 플래그 사용. 1인 화이트리스트 기반으로 수용 가능.
- **조치**: CLAUDE.md에 금지 명령 강화 + 텔레그램 chat_id 기반 화이트리스트 (user_id 불변)
- 플래그 자체는 유지 (Claude CLI 자동화에 필수)

### 🟡 6. TIMESTAMP → TIMESTAMPTZ
- **Codex, Claude 지적** (Gemini 미언급)
- **조치**: 003 마이그레이션에서 모든 TIMESTAMP를 TIMESTAMPTZ로 변경

### 🟡 7. Deadlock 방지 (Lock 파일)
- **Gemini 전용 발견**
- **조치**: executor.sh에서 10분 이상 된 stale lock 자동 삭제 + Python에서 try-finally

### 🟡 8. `msg_id` 타입 확정
- **합의도: 2/3** (Codex, Claude)
- **조치**: UUID (telegram_messages.id) 사용으로 확정. CLAUDE.md에 명시.

---

## 의견 불일치 (설계 판단 필요)

### 스키마 통합 vs 분리
- **Gemini**: chat_messages + telegram_messages 통합 주장 (강력)
- **Codex**: 분리 유지하되 검색 함수에 모두 포함
- **Claude 판단**: **분리 유지**가 맞음. chat_messages는 v1 웹 UI용, telegram_messages는 v2 봇용. 역할이 다름. 검색 함수만 통합.

### 폴링+타이머 지연
- **Gemini**: listener가 executor를 직접 트리거하라 (이벤트 기반)
- **Codex**: 단일 워커로 단순화 가능
- **Claude 판단**: 소놀봇 검증 패턴 유지. 1분 타이머 → quick_check → Claude CLI. 응답 지연 20~30초는 수용. 프로토타입 후 재평가.

### DB 큐 vs 파일 큐
- **Gemini/Codex**: DB 큐 또는 Redis 도입 주장
- **Claude 판단**: **과설계**. atomic write(tmp+rename) + flock으로 충분. 소놀봇이 동일 패턴으로 운영 중.

---

## 최종 수정 액션 리스트

| # | 수정 항목 | 반영 위치 | 우선도 |
|---|----------|----------|--------|
| 1 | search_similar_content에 chat_messages UNION 유지 | 003_v2_schema.sql | 🔴 필수 |
| 2 | telegram_message_id → UNIQUE(chat_id, telegram_message_id) | 003_v2_schema.sql | 🔴 필수 |
| 3 | TIMESTAMP → TIMESTAMPTZ 전체 변경 | 003_v2_schema.sql | 🟡 권장 |
| 4 | pending_messages.json atomic write 패턴 | telegram_listener.py | 🔴 필수 |
| 5 | 임베딩 폴백 → 재시도 3회 + NULL 저장 | embedding.py | 🔴 필수 |
| 6 | msg_id = UUID 확정 | CLAUDE.md, telegram_bot.py | 🟡 권장 |
| 7 | stale lock 자동 삭제 (10분) | executor.sh | 🟡 권장 |
| 8 | CLAUDE.md 금지 명령 강화 | CLAUDE.md | 🟡 권장 |
| 9 | 화이트리스트 = chat_id 기반 (immutable) | telegram_listener.py | 🟡 권장 |
