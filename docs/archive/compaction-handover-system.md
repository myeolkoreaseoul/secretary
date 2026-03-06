# 컴팩션 핸드오버 시스템 — PreCompact + SessionStart Hook

## 개요

Claude Code에서 auto-compaction(자동 컨텍스트 압축) 발생 시 작업 상태가 유실되는 문제를 해결하기 위한 두 단계 hook 시스템.

## 문제

- Claude Code는 컨텍스트가 ~83% 차면 자동으로 대화를 압축(compaction)
- 압축 시 작업 중이던 맥락(어떤 파일 수정 중, 어떤 결정을 내렸는지) 유실
- looprun(devdocs) 3종 문서는 계획된 task에서만 보호 → ad-hoc 작업(디버깅, QA 등)은 무방비
- AI가 "기억해서 저장"하는 건 불가능 (컨텍스트 길어질수록 규칙 잊음)

## 해결: 두 단계 자동 Hook

### Step 1: PreCompact Hook (컴팩션 직전)

- **파일**: `~/.claude/hooks/custom/pre-compact.mjs`
- **트리거**: auto-compaction 직전 자동 발동
- **동작**: 현재 작업 상태를 `~/.claude/handover/latest.md`에 저장
- **저장 내용**:
  - 최근 사용자 요청 5개 (truncated 300자)
  - 작업 중이던 파일 목록 (최근 15개)
  - 활성 devdocs 작업 (`dev/active/` 디렉토리 스캔)
  - 타임스탬프, CWD, 세션 ID
- **중요**: stdout 억제 (`suppressOutput: true`) → 컴팩션 요약에 들어가면 패러프레이즈되므로

### Step 2: SessionStart Hook (컴팩션 직후)

- **파일**: `~/.claude/hooks/custom/compact-restore.mjs`
- **트리거**: 모든 SessionStart 시 발동 (컴팩션 후 포함)
- **동작**: `handover/latest.md`가 2분 이내이면 컨텍스트에 주입
- **핵심**: SessionStart는 컴팩션 **이후**에 주입 → 패러프레이즈 안 됨, 원문 그대로

## 왜 이 방식인가

### PreCompact stdout이 아닌 파일 저장인 이유

- PreCompact의 stdout은 컴팩션 **이전** 컨텍스트에 포함됨
- 함께 요약/압축되면서 지시사항이 패러프레이즈됨 (정확도 60~70%)
- "이 파일 다시 읽어" → "유저가 뭔가 읽고 싶어했음" 정도로 변질
- 따라서 **파일에 저장** → SessionStart가 컴팩션 후 fresh하게 주입

### 2분 타임아웃인 이유

- 새 세션 시작 시 오래된 handover가 불필요하게 주입되는 것 방지
- 컴팩션 → SessionStart는 거의 즉시 발생하므로 2분이면 충분
- 5분 이상으로 늘리면 다른 세션의 handover가 간섭할 수 있음

### looprun(devdocs)과의 관계

| 보호 대상 | 방법 |
|-----------|------|
| 계획된 task (looprun) | devdocs 3종 문서 (plan.md, tasks.md, context.md) |
| ad-hoc 작업 (디버깅, QA 등) | PreCompact + SessionStart hook |
| 둘 다 있을 때 | hook이 dev/active/ 스캔해서 devdocs 존재를 handover에 포함 |

## 설정

### settings.json (발췌)

```json
"PreCompact": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"$HOME/.claude/hooks/custom/pre-compact.mjs\""
      }
    ]
  }
],
"SessionStart": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"$HOME/.claude/hooks/session-start.mjs\""
      }
    ]
  },
  {
    "hooks": [
      {
        "type": "command",
        "command": "node \"$HOME/.claude/hooks/custom/compact-restore.mjs\""
      }
    ]
  }
]
```

### Handover 파일

- **경로**: `~/.claude/handover/latest.md`
- **크기**: ~20-30줄 (토큰 부담 미미)
- **자동 덮어쓰기**: 매 컴팩션마다 갱신

## Handover 파일 예시

```markdown
# Compaction Handover
- Time: 2026-03-04T09:44:28.550Z
- CWD: /home/john/projects/secretary
- Session: abc-123

## 최근 사용자 요청
- 메모리 구조 최적화 진행해줘
- 나머지도 진행해줘

## 작업 중이던 파일
- `/home/john/.claude/projects/-home-john/memory/MEMORY.md`
- `/home/john/.claude/hooks/custom/pre-compact.mjs`

## 활성 devdocs 작업 (이어서 진행할 것)
- `dev/active/architecture-cleanup/` → tasks.md 읽어서 복구
```

## 흐름도

```
[일반 작업 중...]
       ↓
[컨텍스트 83% 도달]
       ↓
[PreCompact hook 자동 발동]
  → transcript에서 사용자 요청 추출
  → tool_use에서 파일 경로 추출
  → dev/active/ 스캔
  → ~/.claude/handover/latest.md 저장
  → stdout 억제 (패러프레이즈 방지)
       ↓
[auto-compaction 실행]
  → 대화 요약/압축
       ↓
[SessionStart hook 발동]
  → compact-restore.mjs 실행
  → latest.md 존재 + 2분 이내?
    → YES: 컨텍스트에 원문 그대로 주입
    → NO: 무시 (suppressOutput)
       ↓
[Claude가 handover 읽고 작업 이어서 진행]
```

## 관련 리서치

- PreCompact stdout은 컴팩션 요약에 포함되어 패러프레이즈됨 (GitHub #14258)
- SessionStart(compact) 주입 버그 → v2.1에서 수정됨 (GitHub #15174)
- "Lost in the Middle" (Stanford): LLM은 컨텍스트 중간 내용 무시 경향
- "Context Length Alone Hurts" (ACL 2025): 토큰 많아질수록 13.9~85% 성능 저하
- CLAUDE.md 300줄 넘으면 규칙 준수율 92% → 71%
