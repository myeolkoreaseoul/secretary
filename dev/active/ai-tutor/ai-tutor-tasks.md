# AI 과외 — 섹션 진행표

<!-- GATE_1_PASSED -->

## 섹션 1: 과외 API 엔드포인트
- [x] `src/app/api/tutor/route.ts` 생성
- [x] `src/lib/claude.ts` CLI 방식으로 전환
- [x] `src/types/index.ts` TutorRequest/TutorResponse 추가
- [x] Codex 리뷰 → 3건 수정 완료
- **상태: ✅ 완료**

## 섹션 2: 과외 UI (프론트엔드)
- [x] `src/hooks/useTextSelection.ts` 생성
- [x] `src/components/SelectionPopup.tsx` 생성
- [x] `src/components/TutorPanel.tsx` 생성
- [x] `src/app/conversations/[id]/page.tsx` 통합
- [x] Codex 리뷰 → 3건 버그 수정 완료
- [x] Ralph 10회 검증 → 13건 이슈 수정 + Architect PASS
- [x] TypeScript 빌드 통과
- **상태: ✅ 완료**

## 섹션 3: Claude Code SessionEnd hook
- [x] `~/.claude/settings.json`에 SessionEnd hook 추가
- [x] dry-run 테스트 (lock 충돌만 확인, 스크립트 정상)
- **상태: ✅ 완료**

## 최종 코드 리뷰
- [x] Codex 리뷰
- [x] 3개 전문 에이전트 리뷰 (security, quality x2)
- [x] Architect 검증 17/17 PASS
- **상태: ✅ 완료**
