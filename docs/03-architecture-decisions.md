# 아키텍처 결정 사항

## 결정 1: AI 엔진 — Claude CLI (Max 구독)

### 배경
- 사용자가 Claude 외 AI는 사용 거부
- Claude Max Plan 구독 중 ($100/월 추정)
- Claude Code CLI (`claude --print`)가 프로그래밍적으로 호출 가능

### 검증 완료 (2026-02-16)
```bash
# Claude CLI 버전
claude --version  # 2.1.42

# 비대화형 호출 (nested session 우회)
env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE claude --print -p "1+1은?" --output-format text
# 결과: "2"

# 분류 작업 테스트
env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE claude --print -p "분류해줘: '운동 귀찮다'"
# 결과: 정상 JSON 응답 (카테고리: 건강, 제목, 요약, 조언)
```

### 구현 방법
```javascript
// Next.js API Route에서 Claude CLI 호출
import { exec } from 'child_process';

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    exec(
      `env -u CLAUDE_CODE_ENTRY_POINT -u CLAUDECODE claude --print -p "${escaped}" --output-format text`,
      { timeout: 60000 },
      (error, stdout) => { ... }
    );
  });
}
```

### 주의사항
- CLI 초기화 오버헤드: 3~10초 (API 대비 느림)
- Max 플랜 사용량 한도 존재
- 밴 리스크: 개인용 하루 50~100건 수준이면 낮음
- 임베딩은 불가 → Gemini API 사용

## 결정 2: 임베딩 — Gemini text-embedding-004

### 이유
- Claude는 임베딩 API 없음
- Gemini 무료 (1,500회/일)
- 768차원, pgvector 호환
- 임베딩만 Gemini 쓰고 나머지는 전부 Claude

## 결정 3: PC 활동 추적 — WSL → PowerShell

### 검증 완료 (2026-02-16)

**방법 1: 모든 윈도우 목록**
```bash
powershell.exe -Command "Get-Process | Where-Object {\$_.MainWindowTitle -ne ''} | Select-Object ProcessName,MainWindowTitle"
```
결과:
- `brave` — 현재 브라우저 탭 제목
- `comet` — 원격 접속
- `ExpressVPN`
- `SnippingTool`

**방법 2: 포커스된 윈도우 (Win32 API)**
```bash
powershell.exe -Command "Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();
    [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@; $h = [Win32]::GetForegroundWindow(); $b = New-Object System.Text.StringBuilder 256; [Win32]::GetWindowText($h, $b, 256); $b.ToString()"
```
결과: 현재 포커스된 윈도우 제목 (인코딩 처리 필요)

### 구현 계획
- 크론잡 (1분 간격)으로 포커스 윈도우 기록
- SQLite 또는 Supabase에 저장
- 1시간 단위로 집계 → 가장 많이 쓴 앱/사이트 요약
- UTF-8 인코딩 처리 필요 (PowerShell 출력)

## 결정 4: 항상 켜둔 PC + SSH 아키텍처

```
┌─────────────────────────────────────────┐
│         항상 켜둔 PC (현재 컴퓨터)        │
│                                         │
│  ┌─────────────┐   ┌────────────────┐   │
│  │ Next.js 서버 │   │ Claude Code    │   │
│  │ (포트 3000)  │──→│ CLI (Max구독)  │   │
│  └──────┬──────┘   └────────────────┘   │
│         │                               │
│         │           ┌────────────────┐   │
│         └──────────→│ Gemini API     │   │
│                     │ (임베딩, 무료)  │   │
│                     └────────────────┘   │
│                                         │
│  ┌─────────────┐   ┌────────────────┐   │
│  │ 크론잡       │   │ Supabase       │   │
│  │ (활동 추적)  │   │ (클라우드 DB)   │   │
│  └─────────────┘   └────────────────┘   │
└───────────┬─────────────────────────────┘
            │ SSH 터널 / Cloudflare Tunnel
            ↓
   📱 어디서든 접속 (폰, 노트북)
```

## 결정 5: 전체 시스템 = 3개 모듈

| 모듈 | 역할 | 우선순위 |
|------|------|---------|
| 1. 채팅 비서 | 자동 분류 + 조언 + 벡터 기억 | Phase 1 |
| 2. 시간 추적 | PC 활동 자동 기록 + Daily Report | Phase 1 |
| 3. 에이전트 | 명령 → 외부 작업 실행 | Phase 2 (추후) |
