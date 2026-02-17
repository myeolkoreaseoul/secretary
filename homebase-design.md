# HomeBase — 중앙 개발 서버 설계도

> **프로젝트명:** HomeBase
> **한줄 요약:** 항상 켜져있는 맥북 한 대를 중심으로, 어떤 기기에서든 끊김 없이 개발하는 시스템
> **상태:** 설계 완료, 구현 대기

---

## 1. 해결하려는 문제

### 현재 상황
```
집 PC에서 코딩 → git push → 회사 PC에서 git pull → 새 세션 시작
                                                    ↑
                                            맥락 완전히 끊김
                                            "아까 뭐 했더라?"
```

- 기기 5개: 집 PC, 회사 PC, 노트북, 폰, 맥북
- 기기 바꿀 때마다 git push/pull 필요
- Claude Code 대화 맥락 완전히 사라짐
- "아까 이거 왜 이렇게 했지?" 매번 처음부터 설명

### 해결 후
```
어떤 기기 → 맥북 접속 → 아까 하던 그 화면 그대로 → 이어서 작업
```

---

## 2. 핵심 개념

```
맥북 = "비서 사무실"

비서(Claude)는 항상 맥북에 앉아있다.
당신은 전화(텔레그램)하거나 방문(원격접속)해서 일을 시킨다.
비서는 같은 책상, 같은 서류철을 보고 있으니 맥락이 안 끊긴다.
```

---

## 3. 전체 구조도

```
┌──────────────────────────────────────────────────────┐
│              맥북 우분투 (항상 ON)                      │
│              프로젝트명: HomeBase                       │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   tmux 세션   │  │ Secretary 봇 │  │  OpenClaw    │ │
│  │  (작업 화면)  │  │ (텔레그램)    │  │  (텔레그램)   │ │
│  │              │  │              │  │              │ │
│  │  claude CLI  │  │  claude CLI  │  │  claude CLI  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └─────────────────┼─────────────────┘          │
│                           │                            │
│                    공유 자원:                            │
│                    ~/.claude/     (세션 기록)            │
│                    ~/projects/    (코드 파일)            │
│                    ~/workspace/   (코딩 작업물)          │
└───────────┬───────────────┼────────────────────────────┘
            │               │
       원격접속(SSH)     텔레그램
            │               │
   ┌────────┴────────┐  ┌──┴──┐
   │  PC / 노트북     │  │ 폰  │
   │                  │  │     │
   │ 터미널 열고       │  │ 텔레 │
   │ "work" 입력      │  │ 그램 │
   │ → 맥북 화면 나옴  │  │     │
   └─────────────────┘  └─────┘
```

---

## 4. 구성 요소

### 4-1. 맥북 (서버)

| 항목 | 설명 |
|------|------|
| 하드웨어 | MacBook A1279 (2009), SSD, 8GB RAM |
| OS | Ubuntu |
| 역할 | 모든 코드 실행, 모든 세션 저장, 모든 봇 실행 |
| 상태 | 항상 켜짐 |

#### 설치할 것
- **tmux**: 꺼지지 않는 작업 화면 (접속 끊어도 살아있음)
- **Claude Code**: AI 코딩 도구 (`npm install -g @anthropic-ai/claude-code`)
- **Node.js 20+**: Claude Code 실행용
- **Python 3.11+**: Secretary 봇 실행용
- **Tailscale**: 어디서든 안전하게 접속 (VPN 같은 것)
- **Secretary 봇**: 텔레그램 AI 비서 (현재 프로젝트)
- **OpenClaw**: 텔레그램 코딩 봇

#### 디렉토리 구조
```
~/
├── projects/
│   ├── secretary/          # AI 비서 봇
│   │   ├── bot/
│   │   │   ├── .env        # API 키들 (비밀)
│   │   │   ├── worker.py
│   │   │   ├── mcp_server.py
│   │   │   ├── telegram_listener.py
│   │   │   └── ...
│   │   └── ...
│   ├── workspace/          # Claude가 코딩할 작업 폴더
│   │   ├── todo-app/
│   │   ├── my-website/
│   │   └── ...
│   └── openclaw/           # OpenClaw 봇
│       └── ...
├── .claude/                # Claude Code 세션 저장소
│   ├── projects/           # 프로젝트별 세션 JSONL 파일
│   ├── history.jsonl       # 전체 세션 목록
│   └── ...
└── .config/
    └── systemd/user/       # 봇 자동 시작 서비스
        ├── secretary-worker.service
        ├── secretary-listener.service
        └── ...
```

### 4-2. Tailscale (네트워크)

```
일반적인 접속:
집 PC ──── 인터넷 ──── 공유기 ──── 맥북
                        ↑
                  포트포워딩, 방화벽, IP 변경... 복잡 😫

Tailscale 접속:
집 PC ──── Tailscale ──── 맥북
회사 PC ── Tailscale ──── 맥북
노트북 ─── Tailscale ──── 맥북
폰 ─────── Tailscale ──── 맥북
                ↑
      앱만 설치하면 끝! 설정 없음 😊
```

- 무료 (개인용 100대까지)
- 모든 기기에 앱 설치 → 같은 계정 로그인 → 끝
- 어디서든 `ssh user@macbook-tailscale-ip`로 접속 가능
- 암호화 자동 적용 (보안 걱정 없음)

### 4-3. tmux (작업 화면 유지)

```
tmux가 하는 일:

09:00  집 PC에서 접속 → tmux 화면 열림 → claude 실행 → 코딩 중...
09:30  접속 끊기 (ctrl+b, d) → tmux 화면은 맥북에서 계속 살아있음
       (claude도 계속 돌아가는 중!)
10:00  회사 PC에서 접속 → tmux attach → 아까 그 화면 그대로!!
```

핵심 명령어 3개만 알면 됨:
```
tmux attach -t work     # 작업 화면에 들어가기
ctrl+b, d               # 작업 화면에서 나가기 (화면은 유지)
tmux new -s work        # 새 작업 화면 만들기 (처음 1번만)
```

### 4-4. SSH 키 (비밀번호 없이 접속)

```
비밀번호 접속:   ssh user@macbook → 비밀번호 입력 → 접속 (매번 귀찮음)
SSH 키 접속:     ssh user@macbook → 즉시 접속     (자동)
```

각 PC/노트북에서 1회 설정하면 이후 비밀번호 없이 접속됨.

### 4-5. 접속 단축 명령

각 PC/노트북에 `work` 명령을 만들어둠:
```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
alias work="ssh -t user@macbook-ip 'tmux attach -t work || tmux new -s work'"
```

이후:
```
$ work     ← 이것만 치면 맥북의 작업 화면에 바로 접속
```

### 4-6. 텔레그램 봇 세션 명령 (Secretary 확장)

폰에서 세션을 관리할 수 있는 명령 추가:

```
/sessions              → 최근 Claude 세션 목록 표시
                         1. todo-app 리팩토링 (2시간 전)
                         2. API 서버 개발 (어제)
                         3. 버그 수정 (3일 전)

/resume 1              → 1번 세션 이어가기
                         (다음 메시지부터 그 세션으로 --resume)

/new                   → 새 세션 시작 (현재 세션 연결 해제)

/current               → 지금 연결된 세션 정보
                         "todo-app 리팩토링 (session: a48ff0ed)"
```

---

## 5. 구현 순서

### Phase 1: 맥북 기본 세팅 (1회)

```
1-1. 맥북 우분투 패키지 업데이트
     sudo apt update && sudo apt upgrade

1-2. 필수 도구 설치
     sudo apt install tmux openssh-server
     # Node.js 20 (nvm으로)
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
     nvm install 20
     # Claude Code
     npm install -g @anthropic-ai/claude-code
     # Python 패키지
     pip install httpx python-dotenv mcp duckduckgo-search python-telegram-bot

1-3. SSH 서버 확인
     sudo systemctl enable ssh
     sudo systemctl start ssh

1-4. Tailscale 설치
     curl -fsSL https://tailscale.com/install.sh | sh
     sudo tailscale up
     # → 브라우저 열어서 로그인 → 맥북 등록 완료
```

### Phase 2: 프로젝트 이전 (1회)

```
2-1. 로컬 PC(WSL2)에서 맥북으로 파일 복사
     # 로컬 PC에서 실행:
     rsync -avz ~/projects/secretary/ user@macbook-ip:~/projects/secretary/
     rsync -avz ~/projects/workspace/ user@macbook-ip:~/projects/workspace/
     rsync -avz ~/.claude/ user@macbook-ip:~/.claude/

2-2. 맥북에서 .env 확인
     cat ~/projects/secretary/bot/.env
     # API 키들 정상 확인

2-3. systemd 서비스 복사 및 등록
     # 서비스 파일 복사 (경로만 맥북 유저에 맞게 수정)
     mkdir -p ~/.config/systemd/user/
     cp secretary-*.service ~/.config/systemd/user/
     systemctl --user daemon-reload
     systemctl --user enable secretary-listener secretary-worker
     systemctl --user start secretary-listener secretary-worker

2-4. 로컬 PC에서 봇 서비스 중지
     # 로컬 PC에서:
     systemctl --user stop secretary-listener secretary-worker
     systemctl --user disable secretary-listener secretary-worker
```

### Phase 3: Tailscale 전체 기기 설정 (1회)

```
3-1. 맥북: 이미 Phase 1에서 완료

3-2. 집 PC: Tailscale 설치
     # Windows: tailscale.com에서 다운로드 설치
     # WSL2: curl -fsSL https://tailscale.com/install.sh | sh

3-3. 회사 PC: 같은 방법

3-4. 노트북: 같은 방법

3-5. 폰: App Store/Play Store에서 Tailscale 설치 → 로그인

3-6. 각 기기에서 맥북 접속 테스트
     ssh user@맥북-tailscale-ip
```

### Phase 4: 편의 설정 (1회)

```
4-1. 각 PC/노트북에 SSH 키 생성 + 맥북에 등록
     ssh-keygen -t ed25519       # 키 생성 (엔터 3번)
     ssh-copy-id user@macbook    # 맥북에 등록 → 이후 비밀번호 불필요

4-2. 각 PC/노트북에 단축 명령 추가
     echo 'alias work="ssh -t user@macbook-ip '\''tmux attach -t work || tmux new -s work'\''"' >> ~/.bashrc

4-3. 맥북에 tmux 기본 세션 생성
     # 맥북에서:
     tmux new -s work -d    # 백그라운드로 세션 생성

4-4. 테스트
     # 아무 PC에서:
     work    ← 맥북 작업 화면 바로 접속되면 성공!
```

### Phase 5: 텔레그램 세션 명령 (코드 수정)

```
5-1. telegram_listener.py에 명령 추가
     /sessions — 최근 세션 목록
     /resume — 세션 전환
     /new — 새 세션
     /current — 현재 세션 정보

5-2. worker.py에 세션 목록 조회 함수 추가
     ~/.claude/history.jsonl 파싱 → 최근 세션 목록 반환

5-3. 테스트
     텔레그램에서 /sessions → 목록 나오면 성공
```

---

## 6. 일상 사용 시나리오

### 시나리오 A: 일반적인 하루

```
📍 09:00 집
   PC 터미널 → work
   → 맥북 접속, claude 화면
   → "이 API 리팩토링해줘" → 작업 시작

📍 09:30 출근
   ctrl+b d (화면 나가기, 작업은 맥북에서 계속됨)

📍 09:45 지하철
   폰 텔레그램 → "아까 리팩토링 어디까지 됐어?"
   → 봇이 같은 세션으로 --resume → 진행 상황 보고

📍 10:00 회사
   회사 PC 터미널 → work
   → 아까 집에서 하던 그 화면 그대로!
   → claude에게 "계속해" → 이어서 작업

📍 12:00 점심
   텔레그램 → "테스트 돌려봐" → 결과 받음

📍 18:30 퇴근 후 카페
   노트북 터미널 → work
   → 회사에서 하던 그 화면 그대로!

📍 23:00 자기 전
   텔레그램 → "내일 할 일 정리해놔"
   → 자는 동안 봇이 처리
```

### 시나리오 B: 긴급 수정

```
📍 주말, 밖에서
   텔레그램 → "서버 에러나는데 로그 확인해봐"
   → 봇이 맥북에서 로그 확인 → 원인 보고
   → "고쳐줘" → 수정 → 배포
   → PC 없이 폰만으로 해결
```

### 시나리오 C: 대형 프로젝트

```
📍 월요일
   집 PC → work → "React 대시보드 만들어줘"
   → 프로젝트 구조 잡기 시작

📍 화요일
   회사 PC → work → "어제 대시보드 이어서, 차트 컴포넌트 추가해"
   → 세션 그대로, 맥락 기억 → 바로 이어서 작업

📍 수요일 이동 중
   텔레그램 → "대시보드에 다크모드 추가해"
   → 봇이 자율적으로 작업 → 진행 보고 → 완료 알림

📍 목요일
   노트북 → work → 전체 리뷰 → 배포
```

---

## 7. 보안 고려사항

| 위험 | 대책 |
|------|------|
| 맥북 원격접속 해킹 | Tailscale은 기기 인증 기반 → 등록된 기기만 접속 가능 |
| API 키 노출 | .env는 맥북에만 존재, git에 안 올림 |
| 세션 탈취 | SSH 키 인증 → 비밀번호보다 안전 |
| 맥북 물리적 도난 | 디스크 암호화 (LUKS) 권장 |

---

## 8. 장애 대응

| 상황 | 대응 |
|------|------|
| 맥북 꺼짐 | systemd 서비스가 자동 재시작, tmux 세션은 재생성 필요 |
| 인터넷 끊김 | 맥북 로컬 작업은 유지, 텔레그램만 안 됨 |
| Tailscale 장애 | 같은 네트워크면 로컬 IP로 직접 접속 |
| Claude API 장애 | 코드는 안전, API 복구 후 자동 재개 |

---

## 9. 예상 소요 시간

| Phase | 내용 | 예상 시간 |
|-------|------|----------|
| 1 | 맥북 기본 세팅 | 30분 |
| 2 | 프로젝트 이전 | 20분 |
| 3 | Tailscale 전체 기기 | 30분 |
| 4 | 편의 설정 (SSH키, 단축키) | 20분 |
| 5 | 텔레그램 세션 명령 | 1시간 (코딩) |
| **합계** | | **약 2.5시간** |

---

## 10. 최종 상태 (완성 후)

```
어떤 기기에서든:

PC/노트북:  "work" 입력      → 1초 만에 맥북 작업 화면
폰:         텔레그램 메시지   → 즉시 봇이 처리
            /sessions        → 세션 목록
            /resume 1        → 원하는 세션으로 전환

세션 맥락:   절대 안 끊김 (모든 게 맥북 한 곳에)
코드 동기화: 불필요 (맥북에만 존재)
git:        배포/버전관리용으로만 사용
```
