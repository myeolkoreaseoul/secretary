# 모듈 2: 시간 추적 (Time Tracker) 요구사항

## 핵심 개념

Daily Report 방식의 시간 관리. 3열 구조:

| 시간 | 계획 (Plan) | 실행 (Actual) | 몰입도 (Focus) |
|------|------------|--------------|---------------|
| 0시 | 수면 | 수면 | - |
| 1시 | 수면 | 수면 | - |
| ... | | | |
| 9시 | 개발 공부 | VS Code 55분 | ★★★★★ |
| 10시 | 개발 공부 | Chrome: 강의 45분 + 카톡 15분 | ★★★★☆ |
| 11시 | 소개팅앱 기획 | 유튜브 30분 + 카톡 20분 + 기타 10분 | ★★☆☆☆ |
| 12시 | 점심 | 점심 | - |
| 13시 | 업무 | Supabase 50분 | ★★★★☆ |
| ... | | | |
| 23시 | 자유시간 | 넷플릭스 | ★☆☆☆☆ |

## 3열 상세

### 1열: 계획 (Plan) — 자동 생성
- 할일 리스트에서 우선순위 순으로 시간 슬롯에 배치
- 고정 일정 (수면, 식사 등) 자동 반영
- 사용자가 수정 가능
- AI가 최적 배치 제안

### 2열: 실행 (Actual) — 자동 + 수동
**온라인 (자동):**
- PC: 1분마다 포커스 윈도우 제목 기록
- 1시간 단위로 집계: "VS Code 35분, Chrome(YouTube) 15분, Slack 10분"
- 브라우저 탭은 제목에서 사이트/내용 추출

**오프라인 (수동):**
- 잠, 식사, 운동, 이동, 미팅 등
- 대부분 시간이 고정 → AI가 패턴 학습 후 자동 제안 가능
- 채팅으로 "12시~1시 점심 먹었어" 입력하면 기록

### 3열: 몰입도 (Focus) — AI 판정 + 수동
**자동 판정 기준:**
- 단일 생산적 앱 장시간 → 높은 몰입도 (VS Code 55분 → ★★★★★)
- 생산적 앱 + 약간의 전환 → 보통 (VS Code 40분 + Slack 20분 → ★★★☆☆)
- 비생산적 앱 주로 → 낮은 몰입도 (유튜브 40분 + 카톡 20분 → ★★☆☆☆)
- 앱 분류: 생산적(IDE, 문서, 학습) vs 소통(메신저, 이메일) vs 여가(유튜브, 넷플, SNS)

**수동:**
- 오프라인 활동 (운동 → ★★★★★, 낮잠 → -)
- 사용자 오버라이드 가능

## 필요한 구성 요소

### 백엔드
1. **Activity Logger (크론잡/데몬)**
   - 1분마다 포커스 윈도우 기록
   - `powershell.exe`로 윈도우 제목 가져오기
   - SQLite 또는 Supabase에 raw 로그 저장

2. **Activity Aggregator**
   - 1시간 단위로 raw 로그 집계
   - 앱별 사용 시간 계산
   - 브라우저 탭 제목에서 사이트 추출

3. **Focus Scorer (Claude CLI)**
   - 시간별 활동 데이터 → 몰입도 판정
   - 1~5점 + 이유

4. **Plan Generator (Claude CLI)**
   - 할일 리스트 + 고정 일정 → 시간표 자동 생성
   - 우선순위 + 예상 소요시간 고려

### DB 테이블 (추가 필요)
```sql
-- raw 활동 로그
activity_logs (
  id, timestamp, window_title, process_name, is_active
)

-- 시간별 집계
hourly_summaries (
  id, date, hour(0-23), activities JSONB,
  focus_score INT, focus_reason TEXT,
  plan TEXT, actual_summary TEXT
)

-- 할일 리스트
todos (
  id, title, priority, estimated_hours,
  category, due_date, is_done
)

-- 고정 일정 (수면, 식사 등)
fixed_schedules (
  id, name, start_hour, end_hour, days_of_week
)
```

### 프론트엔드
1. **Daily Report 페이지** (`/report` 또는 `/time`)
   - 24시간 그리드 (계획 | 실행 | 몰입도)
   - 색상 코딩 (몰입도별)
   - 날짜 선택

2. **할일 관리**
   - 추가/삭제/우선순위 변경
   - 예상 소요시간 설정

3. **오프라인 활동 입력**
   - 채팅에서 자연어로 입력 ("12시~1시 점심")
   - 또는 전용 UI

4. **AI 분석 리포트**
   - 하루 총 생산성 점수
   - 시간 낭비 패턴 분석
   - 개선 조언

## 기술적 고려사항

### PC 활동 추적
- WSL에서 PowerShell 호출은 검증 완료
- UTF-8 인코딩 처리 필요 (한글 윈도우 제목)
- 크론잡은 systemd timer 또는 node-cron 사용
- PC가 꺼져있으면 기록 중단 → 다음 시작 시 빈 시간은 "오프라인"으로 처리

### 스마트폰 (Phase 2)
- Android: Digital Wellbeing API 또는 접근성 서비스
- iOS: Screen Time은 API 공개 안 됨
- 현실적으로 1단계에서는 수동 기록

### 프라이버시
- 윈도우 제목에 민감 정보 포함 가능 (이메일 제목, 채팅 내용 등)
- 로컬 DB 저장, 외부 전송 없음
- Supabase에 저장 시 요약만 저장 (raw 제목은 로컬만)
