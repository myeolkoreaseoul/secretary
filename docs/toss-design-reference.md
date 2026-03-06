# Secretary Frontend Design Reference
## Based on Toss Invest (tossinvest.com) Design System

> 추출일: 2026-03-06
> 이 문서는 두 파트로 구성:
> Part A: 토스증권 사이트 구조 분석 (방 구조, 동선, 정보 계층)
> Part B: 디자인 토큰 레퍼런스 (색상, 폰트, 컴포넌트)

---

# Part A: 사이트 구조 & 정보 설계

## 1. 토스증권 전체 사이트맵

```
tossinvest.com
├── / (홈)
│   ├── 지수 목록 (코스피, 나스닥 등)
│   ├── 실시간 랭킹 차트
│   ├── 지금 뜨는 카테고리
│   └── 국내 투자자 동향
│
├── /feed (피드)
│   ├── /feed/recommended (추천)
│   └── /feed/news (뉴스)
│
├── /screener (주식 골라보기)
│   ├── /screener/[preset-id] (프리셋 필터)
│   └── /screener/user/[preset-id] (사용자 커스텀 필터)
│
├── /account (내 계좌)
│   ├── 내 투자 (보유 종목, 잔고)
│   ├── 관심 (관심종목)
│   ├── 최근 본
│   └── 실시간
│
├── /stocks/[code] (종목 상세)
│   ├── /analytics (분석)
│   ├── /community (토론)
│   ├── /news (뉴스)
│   ├── /order (주문)
│   ├── /option (옵션)
│   └── /transaction-status (거래현황)
│
├── /calendar (캘린더)
│   └── /economic-indicator (경제지표)
│
├── /watchlists (관심종목)
├── /investment-portfolio (투자 포트폴리오)
├── /community (커뮤니티)
│   ├── /lounges/[id]
│   ├── /posts/[id]
│   └── /profile/[id]
│
├── /bonds/[guid] (채권)
├── /news (뉴스)
├── /settings (설정)
└── /indices (지수)
    └── /exchange-rate (환율)
```

## 2. 토스증권의 핵심 구조 패턴

### 2-1. 네비게이션 계층 (3단 구조)
```
Level 1: Top Nav (전역, sticky)
  → 홈 | 피드 | 골라보기 | 계좌
  → 항상 보임, 현재 섹션 표시

Level 2: Sub Tab (섹션별, sticky)
  → 피드: 추천 | 뉴스
  → 계좌: 내 투자 | 관심 | 최근 본 | 실시간
  → 텍스트 탭 + 하단 indicator

Level 3: Filter Chips (컨텍스트별, 가로 스크롤)
  → 홈: 전체 | 국내/해외 | 거래대금 | 급상승 | 급하락
  → 기간: 실시간 | 1일 | 1주일 | 1개월 ...
  → 칩 형태, 선택 시 색상 변경
```

### 2-2. 페이지 유형별 레이아웃

#### Type A: 대시보드형 (홈)
```
[상단 지표 요약 - 가로 스크롤 카드]
[필터 칩 행]
[랭킹 리스트]          [사이드 패널 (데스크탑)]
[카테고리 그리드]
[트렌드 섹션]
```
- 정보가 밀집된 다단 레이아웃
- 위에서 아래로: 요약 → 필터 → 상세
- 데스크탑에서 사이드 패널 활용

#### Type B: 피드형 (피드/뉴스)
```
[탭: 추천 | 뉴스]
[피드 카드 1] - 전체 폭
[피드 카드 2]
[피드 카드 3]
...무한 스크롤
```
- 단일 컬럼, 카드가 세로로 쌓임
- 무한 스크롤
- max-width 800px, centered

#### Type C: 탐색형 (골라보기/스크리너)
```
[필터 칩 행 - 가로 스크롤]
[정렬 옵션 - 드롭다운]
[리스트 아이템 1] - 종목명 | 가격 | 등락률
[리스트 아이템 2]
...
```
- 필터 + 정렬이 상단에
- 리스트/테이블 형태
- 각 아이템 클릭 시 상세로 이동

#### Type D: 상세형 (종목 상세)
```
[헤더: 종목명 + 가격 + 등락률]
[차트 영역]
[탭: 분석 | 커뮤니티 | 뉴스 | 주문]
[탭 콘텐츠]
```
- 상단: 핵심 정보 (이름, 숫자)
- 중간: 시각화 (차트)
- 하단: 탭으로 세부 정보 전환

#### Type E: 계정/설정형
```
[탭: 내 투자 | 관심 | 최근 본 | 실시간]
[요약 카드 (잔고, 수익률)]
[보유 종목 리스트]
```
- 탭으로 하위 섹션 전환
- 상단에 요약 숫자
- 리스트로 상세

### 2-3. 정보 계층 원칙

1. **위에서 아래로 상세화**: 요약 → 필터 → 리스트 → 상세
2. **숫자가 주인공**: 큰 볼드 숫자가 먼저, 라벨은 작게
3. **동작은 인라인**: 별도 액션 영역 없이 리스트 아이템 자체가 클릭 가능
4. **필터는 칩**: 드롭다운이 아닌 가로 스크롤 칩으로 필터 상태 항상 노출
5. **탭으로 전환**: 페이지 이동 대신 탭으로 콘텐츠 전환
6. **무한 스크롤**: 페이지네이션 대신 무한 스크롤 (피드, 리스트)

### 2-4. 사용자 동선

```
홈 (전체 현황 파악)
  ↓ 흥미 있는 항목 클릭
종목 상세 (차트 + 분석 + 뉴스)
  ↓ 관심 등록 또는
계좌 > 관심 (관심종목 관리)
  ↓ 매수/매도
종목 > 주문

피드 (최신 뉴스/추천)
  ↓ 관련 종목 클릭
종목 상세

골라보기 (조건 검색)
  ↓ 필터 적용
결과 리스트 → 종목 상세
```

---

## 3. Secretary에 매핑: 방 구조 설계

### 3-1. Secretary 메뉴 → 토스 구조 매핑

| Secretary 메뉴 | 토스 대응 | 페이지 유형 | 역할 |
|---------------|----------|------------|------|
| **Dashboard** (/) | 홈 (/) | Type A: 대시보드 | 오늘 현황 한눈에 |
| **Tasks** (/todos) | 계좌 (/account) | Type E: 리스트 | 할일 관리 |
| **Time** (/time) | 종목상세 (/stocks) | Type D: 상세+차트 | 시간 분석 |
| **History** (/history) | 피드 (/feed) | Type B: 피드 | 대화 기록 |
| **YouTube** (/yt) | 피드+탐색 혼합 | Type B+C | 영상 다이제스트 |
| **Settings** (/settings) | 설정 (/settings) | Type E | 카테고리/시스템 |

### 3-2. Secretary Top Nav 설계
```
[S 로고] [Dashboard] [Tasks] [Time] [History] [YouTube] [Settings] ... [검색]
```
- 토스처럼 상단 고정
- 6개 메뉴 (토스는 4개지만 우리는 기능이 더 많음)
- 우측 검색 (Ctrl+K)

### 3-3. 페이지별 상세 구조

#### Dashboard (/)
```
[오늘 요약 카드 행]
  [Pending Tasks: 5]  [PC Time: 6h 32m]  [Messages: 12]

[Daily Plan 섹션]
  [AI Generate] [Save]
  [시간 블록 텍스트]

[2단 레이아웃]
  [Top Tasks 리스트]        [Recent Chat 리스트]
  - 우선순위별 정렬          - 최근 5개 메시지
  - 클릭 시 /todos          - 클릭 시 /history

[Activity Heatmap]
  [24시간 격자 - 실제 데이터 연동]
```
- 토스 홈처럼: 상단 요약 숫자 → 중간 핵심 콘텐츠 → 하단 보조
- 숫자가 크고 bold (48px 급)

#### Tasks (/todos)
```
[필터 칩 행: 전체 | P0 | P1 | P2 | P3 | 완료]
[추가 입력 행: input + priority + date + category + Add]

[Pending 리스트]
  [토글 ○] [P0] 할일 제목   [날짜] [카테고리]  [...삭제]
  [토글 ○] [P1] 할일 제목   [날짜] [카테고리]  [...삭제]

[Completed 리스트 (접힘)]
  [토글 ✓] 완료 할일 (line-through)
```
- 토스 계좌 리스트처럼: 각 아이템이 flex row
- 호버 시 액션 버튼 표시
- 필터 칩으로 우선순위 필터

#### Time (/time)
```
[날짜 선택기]
[탭: Time Logs | Plan vs Actual | Weekly Trend]

Time Logs 탭:
  [24시간 타임라인 - 세로]
  - 각 시간대에 앱별 사용 막대 (가로)
  - KST 기준 표시
  [Manual Entry 폼]

Plan vs Actual 탭:
  [2단 비교]
  [Planned]              [Actual]
  09:00 Deep Work        09:00 Chrome 45m
  10:00 Meeting          10:00 Teams 30m

Weekly Trend 탭:
  [7일 막대 차트]
  [일별 총 활동 시간]
```
- 토스 종목상세처럼: 상단 핵심 숫자 → 차트/시각화 → 탭 전환

#### History (/history)
```
[검색바 + 카테고리 필터 칩]

[날짜 구분선: 2026-03-06]
  [ME] 메시지 내용...     10:30
  [AI] 응답 내용...       10:31

[날짜 구분선: 2026-03-05]
  [ME] ...
  [AI] ...

[더 보기 (또는 무한 스크롤)]
```
- 토스 피드처럼: 날짜별 그룹핑 + 세로 피드
- 검색이 실제 작동 (API q 파라미터)
- 카테고리 필터 칩

#### YouTube (/yt)
```
[탭: AI Digest | Videos]

AI Digest 탭:
  [기간 칩: Morning | Evening]
  [날짜 선택기]
  [다이제스트 카드]
    [썸네일] [제목] [채널] [시간]
    [AI 요약 - 3줄]

Videos 탭:
  [검색바]
  [비디오 그리드 (3~4열)]
    [썸네일]
    [제목]
    [채널명]
```
- 토스 피드+탐색 혼합
- 다이제스트는 피드형, Videos는 그리드 탐색형

#### Settings (/settings)
```
[좌측 메뉴]          [우측 콘텐츠]
  Categories          [카테고리 리스트]
  System Info           + Add 버튼
  Security              각 아이템: [색상] 이름 [삭제]
```
- 토스 설정처럼: 좌측 네비 + 우측 콘텐츠

### 3-4. 모바일 Bottom Tab
```
[Dashboard] [Tasks] [Time] [History] [More]
```
- 5개까지만 (YouTube, Settings는 More 안에)

---

# Part B: 디자인 토큰 레퍼런스

## Font

### Stack
```css
/* Secretary에서 사용할 폰트 */
font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
  "Noto Sans KR", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
font-family: Menlo, Consolas, Monaco, monospace;  /* mono */
```

### Weight: 400(regular) / 500(medium) / 600(semibold) / 700(bold)
### Size: 12 / 14 / 15 / 17 / 20 / 24 / 26 / 36 / 48 px
### Line Height: 1.45 기본
### Numbers: font-feature-settings: "tnum"; font-variant: tabular-nums;

## Colors (Dark Mode)

### Background
```
#101013  screen          페이지 배경
#17171c  base            기본 배경
#202027  level01         카드 배경
#2c2c35  level02         호버/플로팅
#3c3c47  level03         active
#4d4d59  level04         강조
```

### Grey (solid)
```
#202027  grey50     #2c2c35  grey100    #3c3c47  grey200
#4d4d59  grey300    #62626d  grey400    #7e7e87  grey500
#9e9ea4  grey600    #c3c3c6  grey700    #e4e4e5  grey800
#ffffff  grey900
```

### Grey (opacity)
```
rgba(209,209,253,0.05)  greyOp50     rgba(217,217,255,0.11)  greyOp100
rgba(222,222,255,0.19)  greyOp200    rgba(224,224,255,0.27)  greyOp300
rgba(232,232,253,0.36)  greyOp400    rgba(242,242,255,0.47)  greyOp500
rgba(248,248,255,0.6)   greyOp600    rgba(253,253,255,0.75)  greyOp700
rgba(253,253,254,0.89)  greyOp800
```

### Semantic
```
blue500:   #3182f6   Primary
blue600:   #2272eb   Primary hover
red500:    #f04452   Danger
green500:  #03b26c   Success
teal500:   #18a5a5   Teal
purple500: #a234c7   Purple
orange500: #f18600   Warning
yellow500: #ffb134   Yellow
```

### Border & Shadow
```css
border: 1px solid #3c3c47;  /* hairline */
box-shadow: 0 0 1px rgba(222,222,255,0.19), 0 2px 4px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.12);  /* medium */
box-shadow: 0 16px 60px 0 rgba(2,9,19,0.91);  /* large */
```

## Spacing
```
Gap:    2 / 4 / 6 / 8 / 12 / 20 / 24 px
Radius: 4 / 6 / 8 / 10 / 12 / 16 / 100 px
```

## Button Variants
| Variant | BG | Text | Hover | Radius |
|---------|-----|------|-------|--------|
| Primary | blue500 | white | blue600 | 8-12px |
| Danger | red500 | white | red600 | 8-12px |
| Secondary | greyOp100 | greyOp800 | greyOp200 | 8px |
| Ghost | transparent | greyOp800 | greyOp100 | 8px |

## Button Sizes
| Size | Height | Font | PadX |
|------|--------|------|------|
| SM | 24px | 12px | 5-6px |
| MD | 32px | 14px | 8-10px |
| LG | 40px | 15px | 12-14px |
| XL | 48px | 17px | 16-20px |

## Chip Variants
| Variant | BG | Text | Hover |
|---------|-----|------|-------|
| Default | greyOp100 | greyOp800 | greyOp200 |
| Active | blueOp50 | blue600 | blueOp100 |

## Transitions
```css
background-color: 0.1s linear / 0.2s ease;
opacity: 0.2s ease;
transform: 0.12s ease;
box-shadow: 0.2s ease;
```

## Design Principles
1. Flat & Minimal — 네온/글로우/그라데이션 없음
2. Opacity layering — greyOpacity로 계층 표현
3. Dense info — 12-14px, 4-8px gap
4. tnum — 모든 숫자에 tabular-nums
5. Color = Meaning — blue/red/green = primary/danger/success
6. Small radius — 8px 기본, max 12px
7. No shadows — flat, box-shadow는 focus용
8. Sticky nav — 상단 네비 + 서브탭 고정
9. Chip filters — 가로 스크롤 칩
10. Semibold default — weight 600 기본
