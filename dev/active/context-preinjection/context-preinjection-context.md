## 설계 결정
- prepare_context/respond_and_classify를 독립 함수로 추출 (삭제 아님 — MCP 하위 호환)
- DB 저장은 fire-and-forget (asyncio.create_task) — 응답 속도 우선
- 서브모델 출력에서 분류 JSON 파싱 실패 시 기본값 폴백

## 발견사항
- Phase 1(스트리밍) 실패: 병목은 API 왕복 횟수, 스트리밍이 아님
- OpenClaw은 context를 system prompt에 사전 주입하여 빠름
- 날씨 질문 시 web_search까지 호출하는 불필요한 중복 있음

## 관련 파일
- `bot/mcp_server.py` — prepare_context(491-541), respond_and_classify(543-572), TOOL_DEFINITIONS(79-252)
- `bot/worker.py` — run_claude(132-270), process_one(413-504)
- `bot/CLAUDE_FULL.md` — 워크플로우(14-58), 실시간 정보(90-108)
- `bot/CLAUDE_SIMPLE.md` — 워크플로우(14-48), 실시간 정보(77-95)
- `bot/supabase_client.py` — DB 클라이언트
- `bot/embedding.py` — 임베딩 생성
- `bot/tests/test_qa.py` — QA 테스트 20개

## 코드 리뷰 결과

### 섹션 1 (mcp_server.py) — PASS
- run_prepare_context/run_respond_and_classify 독립 함수 추출 완료
- _dispatch 하위 호환 유지, TOOL_DEFINITIONS 9개 확인
- import 검증 통과

### 섹션 2 (worker.py) — PASS
- context 사전 주입: run_prepare_context → system_prompt에 context_block 주입
- _build_context_block: 히스토리 10개×200자, 맥락 5개×200자, 카테고리
- _parse_response: ```json 블록 → fallback {...}"category" → 기본값
- fire-and-forget: asyncio.create_task(run_respond_and_classify(..., skip_telegram=True))
- QA 테스트 17/20 통과 (3개 기존 실패, 회귀 없음)

### 섹션 3 (CLAUDE_FULL.md) — PASS
- 2단계 워크플로우 → 바로 답변+분류JSON 출력으로 변경
- 날씨 중복 호출 방지 추가
- 코딩/빌드 워크플로우 respond_and_classify 참조 제거

### 섹션 4 (CLAUDE_SIMPLE.md) — PASS
- CLAUDE_FULL.md와 동일한 변경 적용

### 최종 리뷰 — PASS
- 4개 파일 모두 일관성 확인
- TOOL_DEFINITIONS에서 prepare_context/respond_and_classify 제거 확인
- worker.py에서 import 및 호출 경로 정상
