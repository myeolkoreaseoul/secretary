# AI 과외 — 컨텍스트

## 핵심 결정
- LLM 호출: Claude CLI (`claude -p`) via child_process.execFile (OAuth, API key 없음)
- 프론트엔드: Stitch MCP로 생성
- 텍스트 선택: window.getSelection() + getBoundingClientRect()

## 생성/수정된 파일
| 파일 | 상태 |
|------|------|
| `src/app/api/tutor/route.ts` | 신규 |
| `src/lib/claude.ts` | 수정 (SDK→CLI) |
| `src/types/index.ts` | 수정 (타입 추가) |
| `src/hooks/useTextSelection.ts` | 신규 |
| `src/components/SelectionPopup.tsx` | 신규 |
| `src/components/TutorPanel.tsx` | 신규 |
| `src/app/conversations/[id]/page.tsx` | 수정 (통합) |

## Codex 리뷰 결과
### 섹션 1 (3건 수정)
1. nearby message 쿼리: ascending+lte → descending+gte+reverse
2. message_id 쿼리에 conversation_id 스코프 추가
3. 입력 크기 검증 추가

### 섹션 2 (3건 수정)
1. stale history: setMessages 콜백 내부에서 API 호출
2. Strict Mode double-fire: initialSent ref 가드
3. loading 중 input 클리어 방지
