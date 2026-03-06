# 소놀봇 분석 (mybot_ver2)

> 출처: C:\Users\John\Downloads\mybot_ver2(소놀봇_클로드용)
> 유튜버가 OpenClaw(Clawdbot)의 보안/비용 문제를 해결해 만든 텔레그램 AI 에이전트

## 핵심 요약

**한마디로**: 텔레그램 → 폴링 → Claude Code CLI 실행 → 결과 전송

```
[텔레그램 메시지] → telegram_listener.py (10초 폴링)
       ↓
telegram_messages.json (파일 기반 큐)
       ↓
Windows 작업 스케줄러 (5분 간격)
       ↓
mybot_autoexecutor.bat → claude -p -c (Max 구독)
       ↓
Claude가 telegram_bot.py 함수들 호출
       ↓
telegram_sender.py → [텔레그램 응답]
```

## 아키텍처

| 구성요소 | 기술 | 역할 |
|---------|------|------|
| 채널 | Telegram Bot API | 사용자 ↔ 봇 메시지 송수신 |
| 리스너 | Python (async) | 10초 폴링, 파일 다운로드, JSON 저장 |
| 스케줄러 | Windows Task Scheduler | 5분마다 autoexecutor 실행 |
| 실행기 | BAT → Claude CLI | `claude -p -c` (세션 유지) |
| 메모리 | 파일 기반 (tasks/msg_*/task_info.txt) | 작업 결과 영구 저장 |
| 상태 | JSON 파일들 | telegram_messages.json, working.json, index.json |

## 핵심 설계 패턴

### 1. Claude Max 구독 활용 (API 비용 $0)
```batch
:: 세션 이어서 실행 (컨텍스트 유지)
claude -p -c "시스템 프롬프트..."
:: 실패하면 새 세션
claude -p "시스템 프롬프트..."
```
- `env -u` 같은 환경변수 우회 없이 직접 호출
- `-c` (--continue) 플래그로 이전 세션 컨텍스트 유지

### 2. 3중 중복 실행 방지
1. `tasklist` + `wmic`으로 Claude 프로세스 감지
2. `mybot_autoexecutor.lock` 파일 락
3. `working.json` 활동 기반 타임아웃 (30분)

### 3. 멀티 메시지 병합
```
[10:00] "카페 홈페이지 만들어줘"
[10:01] "반응형으로 해줘"
[10:02] "다크모드도 추가해줘"
→ Claude에게 하나의 통합 지시로 전달
```

### 4. 24시간 대화 컨텍스트
- 최근 24시간의 유저+봇 메시지를 전부 Claude에게 전달
- "거기에 다크모드 추가해" → "거기" = 이전에 만든 cafe.html 이해

### 5. 파일 기반 메모리
```
tasks/
├── index.json          # 검색 인덱스 (키워드, 메시지ID)
├── msg_123/
│   ├── task_info.txt   # [시간][지시][결과][파일] 기록
│   ├── image_123.jpg   # 첨부파일
│   └── cafe.html       # 생성 결과물
└── msg_456/
    └── task_info.txt
```

### 6. 멀티모달 지원
- 사진 → Claude가 Read 도구로 분석
- 문서 (PDF, DOCX) → 파일 경로 전달
- GPS 위치 → 좌표 + Google Maps 링크

## Secretary 프로젝트와의 비교

| 항목 | 소놀봇 | Secretary 목표 |
|------|--------|---------------|
| **채널** | 텔레그램 | 웹 채팅 UI |
| **AI** | Claude CLI (Max) | Claude CLI (Max) ✅ 동일 |
| **메모리** | 파일 기반 (keyword 검색) | 벡터 DB (의미 검색) |
| **자동 분류** | 없음 | ✅ 카테고리 분류 + 조언 |
| **시간 추적** | 없음 | ✅ PC 활동 + Daily Report |
| **에이전틱** | Claude가 셸/파일 직접 조작 | 구현 필요 |
| **스케줄링** | Windows Task Scheduler | 크론잡 / systemd |
| **동시성** | 파일 락 (3중) | 구현 필요 |
| **대화 맥락** | 24시간 히스토리 | 벡터 검색으로 전체 히스토리 |
| **파일 처리** | 텔레그램 첨부 다운로드 | 웹 UI 파일 업로드 |

## 소놀봇에서 배울 점

### 1. Claude CLI 호출 패턴 ⭐
```
claude -p -c "시스템 프롬프트"  # 세션 유지
claude -p "시스템 프롬프트"     # 새 세션 (폴백)
```
- `-p` = print mode (비대화형)
- `-c` = continue (이전 세션 이어서)
- 시스템 프롬프트에 "어떤 함수를 어떤 순서로 호출하라"고 지시

### 2. 시스템 프롬프트로 함수 호출 유도
Claude에게 직접 코드 실행을 시키는 방법:
```
"다음 순서로 함수를 호출하세요:
1. check_telegram() → 대기 메시지 확인
2. combine_tasks() → 메시지 병합
3. create_working_lock() → 락 생성
4. 작업 수행
5. report_telegram() → 결과 전송"
```
→ Claude Code가 Bash 도구로 Python 함수 직접 호출

### 3. 활동 기반 타임아웃
- 진행 보고할 때마다 `last_activity` 갱신
- 30분 무활동 → 스테일 판정 → 자동 복구
- 장시간 작업도 안전하게 처리

### 4. 멀티 메시지 병합
- 여러 메시지를 하나의 작업으로 합치는 패턴
- Secretary에서도: 빠르게 연속 입력한 메시지들을 하나로 처리

## 소놀봇의 한계 (Secretary에서 개선 가능)

| 한계 | Secretary 개선 방향 |
|------|-------------------|
| 파일 기반 메모리 (keyword만) | pgvector 벡터 검색 (의미 기반) |
| 24시간 컨텍스트만 | 전체 히스토리 벡터 검색 |
| 텔레그램만 | 웹 UI (+ 추후 텔레그램 추가 가능) |
| 자동 분류 없음 | 카테고리 분류 + 조언 |
| 시간 추적 없음 | PC 활동 추적 + Daily Report |
| Windows 전용 | WSL 기반 (크로스 플랫폼) |
| 5분 폴링 지연 | 웹소켓 실시간 |

## 파일 구조 (참고)

```
mybot_ver2(소놀봇_클로드용)/
├── telegram_listener.py      # 텔레그램 폴링 + 파일 다운로드
├── telegram_sender.py        # 텔레그램 메시지/파일 전송
├── telegram_bot.py           # 핵심 로직 (상태관리, 메모리, 락)
├── quick_check.py            # 빠른 메시지 확인 (0.1초)
├── mybot_autoexecutor.bat    # Claude CLI 실행기
├── CLAUDE.md                 # Claude에게 주는 시스템 지시
├── setup.bat                 # 초기 설치
├── register_scheduler_FOREGROUND.bat  # 포그라운드 스케줄러
├── register_scheduler_BACKGROUND.bat  # 백그라운드 스케줄러
├── requirements.txt          # Python 의존성
├── .env                      # 텔레그램 토큰, 허용 유저
├── .gitignore
├── telegram_messages.json    # 메시지 저장소
├── working.json              # 작업 락
├── new_instructions.json     # 실시간 추가 지시
├── claude_task.log           # 실행 로그
└── tasks/
    ├── index.json            # 검색 인덱스
    └── msg_*/                # 작업별 폴더
        ├── task_info.txt     # 메모리 기록
        └── (첨부파일들)
```
