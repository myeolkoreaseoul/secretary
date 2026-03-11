# Context Pre-injection 계획

## 목적
Secretary 응답 30초 → 3~8초로 단축. API 라운드트립 5회 → 1~2회.
prepare_context와 respond_and_classify를 tool call에서 빼고 worker가 직접 처리.

## 아키텍처
```
현재: 메시지 → API#1(prepare_context) → API#2(get_weather) → API#3(web_search) → API#4(respond_and_classify) → API#5(end_turn)
변경: 메시지 → worker가 prepare_context 직접 실행 → system prompt에 주입 → API#1(get_weather) → API#2(end_turn+분류JSON)
       → worker가 respond_and_classify 직접 실행 (fire-and-forget)
```

## 섹션 1: mcp_server.py — 로직 추출 + TOOL_DEFINITIONS 정리
- 목적: prepare_context/respond_and_classify 로직을 독립 함수로 분리
- 파일: `bot/mcp_server.py`
- 구현:
  - `run_prepare_context()` 독립 함수 추출 (lines 491-541)
  - `run_respond_and_classify()` 독립 함수 추출 (lines 543-572)
  - `_dispatch`에서는 독립 함수 호출 (하위 호환)
  - TOOL_DEFINITIONS에서 두 항목 삭제 (11→9개)
  - MCP list_tools()에서도 삭제
- 예상 문제점: MCP 서버 모드 호환성 → _dispatch가 독립 함수 호출하므로 OK
- 완료기준: import 가능, _dispatch 동작 유지, TOOL_DEFINITIONS 9개
- 의존: 없음

## 섹션 2: worker.py — context 사전 주입 + 후처리
- 목적: API 호출 전 context 주입, API 응답 후 직접 저장/분류
- 파일: `bot/worker.py`
- 구현:
  - run_claude() 시작에서 run_prepare_context() 호출
  - _build_context_block()으로 system prompt에 context 주입
  - user prompt 변경 (분류JSON 포함 요청)
  - end_turn 시 _parse_response()로 답변/분류 분리
  - run_respond_and_classify() fire-and-forget 호출
  - _build_context_block(), _parse_response() 헬퍼 추가
- 예상 문제점: 서브모델이 분류 JSON 안 붙일 수 있음 → 폴백 기본값 처리
- 완료기준: run_claude가 context 주입하고 후처리까지 완료
- 의존: 섹션 1

## 섹션 3: CLAUDE_FULL.md — 프롬프트 개편
- 목적: 2단계 워크플로우 제거 → 바로 답변+분류JSON 출력
- 파일: `bot/CLAUDE_FULL.md`
- 구현:
  - 워크플로우 섹션을 "context는 이미 주입됨, 바로 답변 생성" 으로 교체
  - "날씨는 get_weather만, web_search 금지" 추가
  - 코딩 워크플로우에서 respond_and_classify 참조 제거
- 예상 문제점: 날씨+웹검색 중복 호출 → 프롬프트에 명시
- 완료기준: prepare_context/respond_and_classify 언급 없음, 분류JSON 출력 형식 명시
- 의존: 없음

## 섹션 4: CLAUDE_SIMPLE.md — 프롬프트 개편
- 목적: FULL과 동일한 워크플로우 변경
- 파일: `bot/CLAUDE_SIMPLE.md`
- 구현: 섹션 3과 동일한 패턴 적용
- 완료기준: prepare_context/respond_and_classify 언급 없음
- 의존: 없음
