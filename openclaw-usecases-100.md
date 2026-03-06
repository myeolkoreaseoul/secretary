# OpenClaw 실사용 사례 100개

> 출처 기반 수집 (Codex 리서치, 2026-02-21)
> **(A)** = X/GitHub/ClawHub 원문 링크 확인 | **(B)** = 공식 쇼케이스/리뷰 문서 기반

---

## 🌐 브라우저 자동조작 계열 (1~23)

1. **Tesco 장보기 완전 자동화** (A) | @marchattonhere, https://x.com/i/status/2009724862470689131
   어떻게: Tesco 웹 장보기 플로우를 브라우저 자동조작으로 끝까지 수행 — 식단→단골품목→배송 슬롯→주문 확정
   도구: `browser`, `telegram`, `exec`

2. **ParentPay 학교급식 예약 자동화** (A) | @George5562, https://docs.openclaw.ai/showcase
   어떻게: ParentPay 예약 페이지를 브라우저로 자동 탐색, 좌표 클릭까지 포함한 정기 예약
   도구: `browser`, `cron`, `telegram`

3. **TradingView 로그인→차트 분석** (A) | @bheem1798, https://docs.openclaw.ai/showcase
   어떻게: TradingView에 API 없이 브라우저 로그인 후 차트 캡처/기술적 분석 수행
   도구: `browser`, `telegram`

4. **Padel 코트 예약 봇 (Playtomic)** (A) | @joshp123, https://github.com/joshp123/padel-cli
   어떻게: Playtomic 예약 사이트를 주기적으로 점검, 빈자리 감지 시 자동 예약 실행
   도구: `browser`, `exec`, `cron`

5. **비자 예약 가능 슬롯 자동 모니터링** (A) | @TheLazylife__, https://x.com/TheLazylife__/status/1979122325581768890
   어떻게: 비자 예약 페이지를 주기적으로 브라우저로 열어 슬롯 상태 확인, 열리면 즉시 Telegram 알림
   도구: `browser`, `cron`, `telegram`

6. **Klaviyo AI 캠페인 자동 실행** (A) | @ramziabda, https://x.com/ramziabda/status/1981945684149739769
   어떻게: Klaviyo 관리자 페이지를 브라우저로 조작해 캠페인 설정/실행 자동화
   도구: `browser`, `exec`

7. **Shopify 스토어 런칭 작업 원격 제어** (A) | @mikebuddy00, https://x.com/mikebuddy00/status/1985259196767887447
   어떻게: Shopify 관리자 페이지에서 상품/설정 작업을 텔레그램 지시로 브라우저 처리
   도구: `browser`, `telegram`

8. **Shopify 데이터 추출→Supabase 적재** (A) | @coard, https://x.com/coard/status/1998544977410769185
   어떻게: Shopify 사이트를 브라우저로 탐색해 데이터 수집 후 Supabase DB에 저장
   도구: `browser`, `exec`

9. **정밀 브라우저 오케스트레이션 실험** (A) | @arihantm0, https://x.com/arihantm0/status/1984964832125089890
   어떻게: browser tool을 단계별 스킬로 분리해 복잡한 웹 작업 흐름 정밀 제어
   도구: `browser`, `skills`

10. **가격 모니터링+음성 알림** (A) | https://x.com/openclawai/status/1985345009107259578
    어떻게: 관심 상품 페이지를 cron으로 주기 점검, 가격 변동 시 음성+메시지 알림
    도구: `browser`, `cron`, `voice`

11. **브라우저 해킹 미니게임 자동 플레이** (A) | @taurenagent, https://x.com/taurenagent/status/1985371423516772496
    어떻게: 웹 기반 게임의 반복 상호작용을 브라우저 자동화로 처리
    도구: `browser`, `exec`

12. **Luma Dream Machine 영상 생성 파이프라인** (A) | @sourabhwadia, https://x.com/sourabhwadia/status/1984896447843854664
    어떻게: Luma Dream Machine 사이트에 프롬프트 입력→생성 대기→결과 다운로드 자동화
    도구: `browser`, `exec`

13. **레스토랑 예약 에이전트** (A) | @taurenagent, https://x.com/taurenagent/status/1983931650561923441
    어떻게: 예약 사이트를 브라우저로 탐색, 조건(날짜/인원/시간) 맞는 슬롯 선택/확정
    도구: `browser`, `telegram`

14. **Monday.com↔Telegram 동기화** (A) | @taurenagent, https://x.com/taurenagent/status/1983596771672733935
    어떻게: Monday.com 브라우저 조작으로 태스크 변경, 결과를 Telegram으로 양방향 연결
    도구: `browser`, `telegram`, `exec`

15. **Unsplash 자동 배경화면 설정** (A) | @driya_ai, https://x.com/driya_ai/status/1983255894722992382
    어떻게: Unsplash에서 주기적으로 이미지 수집 후 시스템 배경화면으로 자동 적용
    도구: `browser`, `cron`, `exec`

16. **단축키로 브라우저 자동화 호출** (A) | @lunik_ai, https://x.com/lunik_ai/status/1982941652522648032
    어떻게: 클릭/폼입력 플로우를 단축키로 즉시 재사용 가능하게 스킬화
    도구: `browser`, `exec`

17. **실시간 OCR+카메라 업로드 워크플로** (A) | @sourabhwadia, https://x.com/sourabhwadia/status/1982743676437258678
    어떻게: 노드 카메라로 이미지 캡처 후 OCR 텍스트 추출, 결과 자동 처리
    도구: `nodes`, `file`, `exec`

18. **영화 밤 의사결정 (날씨+예약 종합)** (A) | @thetinyoctopus, https://x.com/thetinyoctopus/status/1985762994569417135
    어떻게: 날씨/영화 시간표/예약 가능성을 브라우저로 동시 조회해 최적 선택 추천
    도구: `browser`, `exec`, `telegram`

19. **n8n vs OpenClaw 실사용 비교** (A) | @driya_ai, https://x.com/driya_ai/status/1982494130892785825
    어떻게: 동일 자동화 시나리오를 n8n과 OpenClaw 양쪽에서 직접 구현해 결과 비교
    도구: `exec`, `browser`

20. **OpenAI Operator vs OpenClaw 비교 에이전트** (A) | @sourabhwadia, https://x.com/sourabhwadia/status/1985837049616218393
    어떻게: 동일 웹 작업을 Operator와 OpenClaw로 각각 수행, 성능/정확도 비교
    도구: `browser`, `multi-agent`

21. **Browser Automation 실전 적용 (공식 케이스)** (A) | https://docs.openclaw.ai/case-studies/the-power-of-browser-automation
    어떻게: 웹 기반 반복 업무(로그인/폼/데이터 수집)를 브라우저 도구로 대체한 실사례 모음
    도구: `browser`, `cron`

22. **OpenAI Operator/Manus 대비 벤치마크** (A) | https://docs.openclaw.ai/case-studies/openai-operator-vs-manus-vs-openclaw-the-ai-agent-benchmark-you-need
    어떻게: 실제 과제(예약/검색/폼 제출)를 3개 에이전트로 수행 비교
    도구: `browser`, `exec`

23. **브라우저 퍼스트 자동화로 도구 대체** (B) | @sourabhwadia, https://docs.openclaw.ai/showcase
    어떻게: API 없이 웹 UI만으로 가능한 모든 업무를 브라우저 자동화로 처리
    도구: `browser`, `exec`

---

## 📱 Telegram 단일 채널 운영 계열 (24~36)

24. **Telegram으로 iOS 앱 제작→TestFlight 배포** (A) | @coard, https://x.com/coard/status/1972353964596510790
    어떻게: 맵/음성녹음 포함 iOS 앱을 텔레그램 대화로 지시, 빌드/서명/TestFlight 배포까지 완주
    도구: `exec`, `tmux`, `telegram`

25. **넷플릭스 보면서 Telegram으로 사이트 마이그레이션** (A) | @davekiss, https://x.com/davekiss/status/1983163431883227287
    어떻게: Notion→Astro 콘텐츠 이관 + DNS 전환을 소파에서 텔레그램으로 지시
    도구: `file`, `exec`, `telegram`

26. **GitHub PR 리뷰→Telegram 병합 판정** (A) | @bangnokia, https://x.com/bangnokia/status/1989224281595910504
    어떻게: 코드 변경 후 PR 자동 점검, 치명 이슈 먼저 요약해 병합 결정 지원
    도구: `exec`, `telegram`

27. **오픈소스 기여를 Telegram+TMUX로 수행** (A) | @balupton, https://x.com/balupton/status/2011842741554907527
    어떻게: 원격 tmux 세션에서 코딩/커밋/PR 제출을 텔레그램 명령으로 진행
    도구: `tmux`, `exec`, `telegram`

28. **React 앱 제작을 TMUX로 원격 운영** (A) | @soundsgood____, https://x.com/soundsgood____/status/1985941638789154916
    어떻게: 빌드/실행/수정 세션을 모바일 텔레그램에서 tmux 명령으로 통제
    도구: `tmux`, `exec`, `telegram`

29. **문맥 장기 보존 Telegram 비서** (A) | @jromanma, https://x.com/jromanma/status/1983540592137435157
    어떻게: 대화 히스토리를 세션에 유지해 맥락 끊김 없이 개인 비서로 운영
    도구: `telegram`, `memory`

30. **Telegram 대화에서 스킬 프롬프트 직접 개선** (A) | @jromanma, https://x.com/jromanma/status/1996106518410420263
    어떻게: 대화 중 스킬 지시문을 즉시 수정하고 재실행해 반복 개선
    도구: `skills`, `telegram`

31. **Slack 고객지원 자동화 + 버그 자율수정** (A) | @henrymascot, https://x.com/henrymascot/status/1987630051949682920
    어떻게: Slack 채널을 모니터링해 티켓 대응, 프로덕션 버그 수정까지 자율 수행
    도구: `telegram`, `exec`, `multi-agent`

32. **4o-image 자동 포스팅 파이프라인** (A) | @mikebuddy00, https://x.com/mikebuddy00/status/2006079567681386518
    어떻게: 이미지 생성 후 지정 채널/플랫폼에 자동 게시, cron으로 주기 실행
    도구: `exec`, `cron`, `telegram`

33. **원격 맥/서버 관제 (Telegram 1개 채널)** (B) | https://docs.openclaw.ai/showcase
    어떻게: 서버 상태 확인/명령 실행/결과 회신을 텔레그램 단일 채널로 통합 관리
    도구: `telegram`, `exec`, `tmux`

34. **"Mac이 두뇌가 됨" 개인 비서화** (B) | @yashrajbharti, https://docs.openclaw.ai/showcase
    어떻게: 맥북의 모든 작업을 원격 명령형으로 운영, 텔레그램이 유일한 인터페이스
    도구: `telegram`, `exec`

35. **"CLI를 주머니에 넣음" 모바일 원격 운영** (B) | @songsgood, https://docs.openclaw.ai/showcase
    어떻게: 폰 텔레그램에서 서버/코드 세션 직접 제어, 노트북 없이 운영
    도구: `telegram`, `tmux`

36. **TMUX 세션 원격 디버깅/재시작** (B) | https://docs.openclaw.ai/showcase
    어떻게: 장기 실행 중인 작업을 폰에서 tmux 명령으로 점검/재시작
    도구: `tmux`, `telegram`

---

## ⏰ cron 스케줄링 자동화 계열 (37~46)

37. **Todoist MCP+Cron 할일 자동 갱신** (A) | @iamsubhrajyoti, https://x.com/iamsubhrajyoti/status/1985835882089728039
    어떻게: 정해진 주기로 Todoist MCP에 쿼리해 할일 동기화/정리 자동 실행
    도구: `mcp`, `cron`, `telegram`

38. **프롬프트 파이프라인+일일 요약** (A) | https://x.com/openclawai/status/1981773198532636926
    어떻게: 여러 작업 결과를 cron으로 수집해 하루 단위 요약 보고서 생성
    도구: `cron`, `telegram`, `exec`

39. **이메일 주문 처리 자동화 (Etinipharm)** (A) | https://docs.openclaw.ai/case-studies/etinipharm-email-order-processing
    어떻게: 수신 메일을 분류→처리→결과 알림까지 파이프라인으로 자동화
    도구: `exec`, `file`, `telegram`

40. **제품 출시 운영 자동화 (DSGN Studio)** (A) | https://docs.openclaw.ai/case-studies/dsgn-studio-product-launch
    어떻게: 런칭 태스크(공지/배포/알림)를 cron + 메시지 워크플로로 묶어 실행
    도구: `exec`, `cron`, `telegram`

41. **AERPaw ParentPay 자동화** (A) | https://docs.openclaw.ai/case-studies/aerpaw-parentpay-automation
    어떻게: 학교 결제/예약 반복 업무를 cron으로 정기 자동화
    도구: `browser`, `cron`

42. **"일주일 만에 인생 자동화"** (B) | @balupton, https://docs.openclaw.ai/showcase
    어떻게: 개인 반복업무(알림/수집/정리)를 텔레그램 중심으로 전면 자동화, 일주일 내 완성
    도구: `telegram`, `exec`, `cron`

43. **정기 보고서 자동 생성/전송** (B) | https://docs.openclaw.ai/showcase
    어떻게: cron으로 실행 → 결과 파일 생성 → 메신저 전송까지 완전 무인화
    도구: `cron`, `telegram`, `file`

44. **"오토파일럿 직원" 업무대행** (B) | @mahanhai, https://docs.openclaw.ai/showcase
    어떻게: 반복 태스크를 에이전트에게 위임, 사람 없이 운영되는 자동화
    도구: `exec`, `cron`

45. **클라우드 브라우저 세션으로 무중단 작업** (B) | https://docs.openclaw.ai/showcase
    어떻게: 원격 브라우저 세션에서 cron 기반 장시간 자동화 실행, 끊김 없이 유지
    도구: `browser`, `cron`

46. **이벤트 트리거 기반 워크플로 자동 시작** (B) | https://docs.openclaw.ai/showcase
    어떻게: 특정 조건(파일 변경/메시지/시간) 발생 시 세션 자동 구동
    도구: `cron`, `exec`

---

## 🔧 스킬(ClawHub) 생성·활용 계열 (47~60)

47. **Todoist 스킬 즉석 생성** (A) | @iamsubhrajyoti, https://x.com/iamsubhrajyoti/status/1981807305718288580
    어떻게: 자연어 요청만으로 Todoist 연동 스킬을 대화 중 즉석 생성/실행
    도구: `skills`, `telegram`

48. **와인 셀러 962병 CSV 스킬화** (A) | @prades_maxime, https://x.com/prades_maxime/status/1981809540795756900
    어떻게: CSV 파일 제공 → 에이전트가 질의 가능한 스킬로 자동 변환, 이름/빈티지/위치 검색
    도구: `file`, `skills`

49. **Bambu 3D 프린터 제어 스킬** (A) | @tobiasbischoff, https://clawhub.com/tobiasbischoff/bambu-cli
    어떻게: 프린터 작업 상태 조회/제어/AMS 관리/보정 명령을 스킬로 패키징
    도구: `exec`, `skills`, `telegram`

50. **빈 교통망 실시간 조회 스킬** (A) | @hjanuschka, https://clawhub.com/hjanuschka/wienerlinien
    어떻게: Wiener Linien API 연동 스킬로 실시간 지연/장애/엘리베이터 상태 조회
    도구: `skills`, `exec`

51. **Jira 스킬 즉석 생성** (A) | @jdrhyne, https://x.com/jdrhyne/status/2008336434827002232
    어떻게: ClawHub 등록 전 현장에서 직접 Jira 연동 스킬 생성/테스트
    도구: `skills`, `exec`

52. **R2 업로드 + Presigned URL 배포 스킬** (A) | @julianengel, https://clawhub.com/skills/r2-upload
    어떻게: 원격 환경 파일 전달을 위해 Cloudflare R2 업로드 + URL 생성 스킬화
    도구: `skills`, `exec`

53. **Custom MCP로 외부 데이터 연결** (A) | https://x.com/openclawai/status/1981372933266731194
    어떻게: 사용자 자체 데이터소스용 MCP 서버를 구성해 에이전트에 연결
    도구: `mcp`, `exec`

54. **Skills Marketplace 활용 (공식 케이스)** (A) | https://docs.openclaw.ai/case-studies/skills-marketplace-impact
    어떻게: ClawHub에서 스킬을 찾아 바로 배포/재사용, 개발 시간 단축
    도구: `clawhub`, `skills`

55. **실시간 AI 에이전트 챌린지 운영** (A) | https://docs.openclaw.ai/case-studies/real-time-ai-agent-challenges
    어떻게: 실시간 과제 경쟁 시나리오에서 에이전트 운영, 스킬 즉석 추가
    도구: `multi-agent`, `exec`

56. **로컬 스크립트를 REST API처럼 배포해 호출** (B) | https://docs.openclaw.ai/showcase
    어떻게: 기존 bash/python 스크립트를 스킬로 래핑, 텔레그램으로 원격 호출
    도구: `exec`, `skills`

57. **사내 전용 지식 스킬 (프라이빗)** (B) | https://docs.openclaw.ai/showcase
    어떻게: 내부 문서/SOP를 프라이빗 스킬로 캡슐화해 팀 내 에이전트 질의
    도구: `skills`, `file`

58. **ClawHub 퍼블리시/재사용 기반 팀 생산성화** (B) | https://docs.openclaw.ai/showcase
    어떻게: 팀 공통 스킬을 ClawHub에 공유, 팀원이 바로 설치해 재사용
    도구: `clawhub`, `skills`

59. **"불필요한 도구를 없앰" 업무 통합** (B) | @jromanma, https://docs.openclaw.ai/showcase
    어떻게: 여러 SaaS 자동화를 단일 OpenClaw 허브로 통합, 스킬 하나로 대체
    도구: `skills`, `telegram`

60. **"주말 프로젝트가 실제 프로덕트로"** (B) | @amit_ksingh, https://docs.openclaw.ai/showcase
    어떻게: 실험적 아이디어를 스킬로 빠르게 프로토타입, 실제 운영 자동화로 고도화
    도구: `skills`, `exec`

---

## 🤖 멀티에이전트·오케스트레이션 계열 (61~72)

61. **14+ 에이전트 오케스트레이션** (A) | @adam91holt, https://x.com/adam91holt/status/1985278522577631363
    어떻게: Opus가 지휘, Codex 워커 14개 이상을 병렬 세션으로 운영, 역할 분업 문서화
    도구: `multi-agent`, `telegram`

62. **멀티에이전트 병렬 조사/요약 파이프라인** (B) | https://docs.openclaw.ai/showcase
    어떻게: 하위 에이전트 3개 동시 투입 (A: 사실확인, B: 문서 정리, C: 일정 영향) → 메인이 합쳐 브리핑
    도구: `multi-agent`, `exec`

63. **가상 테이블탑 게임 호스트 에이전트** (A) | @taurenagent, https://x.com/taurenagent/status/1985371385302376493
    어떻게: 게임 규칙/진행/상태 관리를 에이전트가 담당, 참여자는 텔레그램으로 행동 입력
    도구: `multi-agent`, `telegram`

64. **Gomoku 게임 (멀티 AI 상대)** (A) | @taurenagent, https://x.com/taurenagent/status/1981708531055784434
    어떻게: 두 AI 에이전트가 서로 대국, 게임 로직/상태/결과 관리 자동화
    도구: `multi-agent`, `exec`

65. **Claude Code + OpenClaw 협업 자동화** (B) | @JibBran, https://docs.openclaw.ai/showcase
    어떻게: Claude Code가 코딩, OpenClaw가 오케스트레이션·배포 담당으로 역할 분리
    도구: `multi-agent`, `exec`

66. **로컬+클라우드 혼합 운영** (B) | @paololeonardi, https://docs.openclaw.ai/showcase
    어떻게: 외부 API/클라우드 서버/로컬 작업을 멀티에이전트 흐름으로 통합
    도구: `exec`, `multi-agent`

67. **온디맨드 자동화 챗옵스** (B) | @taurenagent, https://docs.openclaw.ai/showcase
    어떻게: 텔레그램으로 명령 보내면 멀티에이전트가 즉시 워크플로 실행
    도구: `telegram`, `multi-agent`

68. **OpenAI Operator/Manus 대비 멀티에이전트 벤치마크** (A) | https://docs.openclaw.ai/case-studies/openai-operator-vs-manus-vs-openclaw-the-ai-agent-benchmark-you-need
    어떻게: 동일 과제를 여러 에이전트로 분산 수행, 결과 집계 비교
    도구: `multi-agent`, `browser`

69. **Slack Auto-Support + 자율 버그 수정** (A) | @henrymascot, https://x.com/henrymascot/status/1984267847868149856
    어떻게: 지원 채널 모니터링→응답 생성→텔레그램 포워딩, 관련 코드 자율 수정까지
    도구: `exec`, `telegram`, `multi-agent`

70. **CTF 사이버보안 훈련 게임 운영** (A) | @henrymascot, https://x.com/henrymascot/status/1984267847868149856
    어떻게: CTF 문제 풀이/힌트 제공/정답 검증 흐름을 에이전트화
    도구: `exec`, `telegram`

71. **디렉터리 맵 생성 에이전트** (A) | @taurenagent, https://x.com/taurenagent/status/1985371366025439493
    어떻게: 파일시스템을 재귀적으로 스캔해 시각적/텍스트 구조 맵 자동 생성
    도구: `file`, `exec`

72. **"빨리 만들고 배포" 빌드 파이프라인** (B) | @joshp123, https://docs.openclaw.ai/showcase
    어떻게: 개발-실행-검증 반복을 에이전트화, tmux 세션에서 빌드 실행 및 로그 확인
    도구: `exec`, `tmux`

---

## 🎤 음성·IoT·노드 계열 (73~80)

73. **Whisper 기반 음성 비서** (A) | @taurenagent, https://x.com/taurenagent/status/1982941992244050147
    어떻게: 음성 입력을 Whisper로 텍스트화, 에이전트 명령으로 변환해 후속 실행
    도구: `voice`, `exec`

74. **Whisper 기반 음성→텍스트 업무처리** (A) | https://x.com/openclawai/status/1982048566678374824
    어떻게: 음성 인식 결과로 태스크 생성/실행 트리거, 핸즈프리 워크플로
    도구: `voice`, `exec`

75. **ElevenLabs/OpenAI TTS 응답 생성** (A) | https://x.com/openclawai/status/1981805716527057062
    어떻게: 에이전트 텍스트 응답을 TTS로 변환해 음성으로 전달
    도구: `voice`, `exec`

76. **음성모드 기반 핸즈프리 명령 실행** (B) | https://docs.openclaw.ai/showcase
    어떻게: 음성 입력을 워크플로 트리거로, 응답도 음성으로 수신하는 완전 핸즈프리 루프
    도구: `voice`, `exec`

77. **Home Assistant 애드온 상시 구동** (A) | @ngutman, https://github.com/ngutman/openclaw-ha-addon
    어떻게: HA OS에 OpenClaw를 애드온으로 설치, 터널/상태 유지 포함 실운영
    도구: `nodes`, `exec`

78. **비개발자 홈오토메이션 구축** (B) | @kimikate, https://docs.openclaw.ai/showcase
    어떻게: 코드 없이 노드/스킬 조합으로 스마트홈 자동화 구성
    도구: `nodes`, `skills`, `telegram`

79. **스마트홈 장치 명령 매핑 자동화** (B) | https://docs.openclaw.ai/showcase
    어떻게: 장치 이벤트(모션/온도)를 OpenClaw 명령으로 연결해 자동 반응
    도구: `nodes`, `telegram`

80. **날씨 시계 SVG→3D STL 생성** (A) | @balupton, https://x.com/balupton/status/1985680943052783738
    어떻게: 날씨 데이터로 SVG 시각화 생성 후 3D 프린팅용 STL 파일로 자동 변환
    도구: `exec`, `file`

---

## 💻 개발·코딩 보조 계열 (81~92)

81. **자동완성 CLI로 서버 제어** (A) | @lunik_ai, https://x.com/lunik_ai/status/1982610303173640422
    어떻게: 명령 자동완성 기능으로 원격 서버 운영 속도/정확도 향상
    도구: `exec`, `tmux`

82. **Vim 키바인딩으로 고속 조작** (A) | @lunik_ai, https://x.com/lunik_ai/status/1983224840842703183
    어떻게: OpenClaw 작업흐름에 Vim 키맵 적용, 반복 조작 최적화
    도구: `exec`, `tmux`

83. **커스텀 단축키 명령 실행** (A) | @lunik_ai, https://x.com/lunik_ai/status/1982972186610940343
    어떻게: 자주 쓰는 실행 루틴을 단축 명령으로 묶어 텔레그램에서 즉시 호출
    도구: `exec`, `telegram`

84. **Excalidraw 웹앱 생성 자동화** (A) | @markzads, https://x.com/markzads/status/1982666883620147504
    어떻게: 아이디어 → Excalidraw 코드 생성 → 실행 → 결과 확인 루프 자동화
    도구: `exec`, `file`, `telegram`

85. **파일 읽기/수정/저장 자동 루프** (B) | https://docs.openclaw.ai/showcase
    어떻게: 문서/코드 파일을 에이전트가 직접 읽고 편집하고 저장하는 완전 자동화
    도구: `file`, `exec`

86. **이미지 기반 입력 처리 파이프라인** (B) | https://docs.openclaw.ai/showcase
    어떻게: 이미지 업로드→분석→후속 액션(태깅/분류/저장)을 파이프라인으로 처리
    도구: `file`, `exec`, `browser`

87. **Docker/AWS 배포 후 Telegram 운영체계화** (B) | https://docs.openclaw.ai/showcase
    어떻게: 서버 배포 뒤 채팅 명령으로 서비스 시작/중지/로그 확인 운영
    도구: `exec`, `telegram`, `cron`

88. **MCP 서버 연동형 데이터 워크플로** (B) | https://docs.openclaw.ai/showcase
    어떻게: 외부 MCP 서버를 연결해 조회/실행을 에이전트 흐름에 통합
    도구: `mcp`, `exec`

89. **"아이디어→실행 최소 마찰" 개인 워크플로** (B) | @markzads, https://docs.openclaw.ai/showcase
    어떻게: 프롬프트 기반 코드/작업 즉시 생성 → 실행 → 결과 확인까지 원스톱
    도구: `exec`, `file`

90. **음식 사진 OCR→영양 분석** (A) | @LorenzoKattoor, https://x.com/LorenzoKattoor/status/1981817949587104110
    어떻게: 음식 사진을 OCR로 식재료 추출 후 영양 DB 조회해 자동 분석
    도구: `browser`, `exec`, `file`

91. **"오픈소스여서 커스터마이즈 용이" 팀 적용** (B) | @driya_ai, https://docs.openclaw.ai/showcase
    어떻게: 소스 직접 수정해 내부 워크플로에 맞게 확장, 팀 전체 배포
    도구: `exec`, `skills`

92. **설치 스크립트로 온보딩 단축** (A) | https://x.com/openclawai/status/1982187151721230717
    어떻게: 초기 구성 절차(설치/인증/설정)를 자동화 스크립트 하나로 완료
    도구: `exec`

---

## 🧪 실험·창작·기타 계열 (93~100)

93. **TOR 기반 다크웹 모니터링** (A) | @driya_ai, https://x.com/driya_ai/status/1982809162859919596
    어떻게: TOR 프록시로 지정 대상을 주기 모니터링, 변화 감지 시 보고
    도구: `exec`, `cron`

94. **Breaking Bad 스타일 자동화 실험** (A) | @driya_ai, https://x.com/driya_ai/status/1981385541512353981
    어떻게: 테마형 시나리오(단계별 지시/반응)를 자동화 워크플로로 구현
    도구: `exec`, `telegram`

95. **GoHome: Nix 기반 홈오토메이션 + Grafana 시각화** (A) | @joshp123, https://docs.openclaw.ai/showcase
    어떻게: OpenClaw를 홈 제어 인터페이스로 전면 사용, Grafana로 상태 시각화
    도구: `nodes`, `exec`, `browser`

96. **브라우저 작업을 폰에서 제어** (B) | @max_prades, https://docs.openclaw.ai/showcase
    어떻게: 이동 중 폰 텔레그램으로 웹 작업 지시, 결과 수신
    도구: `browser`, `telegram`

97. **"직관적 AI 도구" 비기술 사용자 적용** (B) | @nailabz, https://docs.openclaw.ai/showcase
    어떻게: 코드 없이 대화형 인터페이스만으로 자동화 구성
    도구: `telegram`, `skills`

98. **학생 생산성 자동화** (B) | @ezrraik, https://docs.openclaw.ai/showcase
    어떻게: 과제 마감 알림/일정 정리/공부 루틴을 cron + 텔레그램으로 자동화
    도구: `cron`, `telegram`

99. **개인 사업자 운영 자동화** (B) | @lumeonx, https://docs.openclaw.ai/showcase
    어떻게: 반복 운영 업무(발주/알림/보고)를 에이전트에게 위임해 자동 처리
    도구: `exec`, `cron`

100. **"배터리 포함된 AI 에이전트" 즉시 적용** (B) | @ngutman, https://docs.openclaw.ai/showcase
     어떻게: 설치 후 별도 설정 없이 바로 실무 자동화 사용 가능한 올인원 구성
     도구: `exec`, `telegram`

---

## 주요 출처
- 공식 쇼케이스/리뷰: https://docs.openclaw.ai/showcase
- 공식 케이스스터디: https://docs.openclaw.ai/case-studies/
- ClawHub 스킬 마켓: https://clawhub.com
- X/Twitter 실사용 포스팅: @marchattonhere, @taurenagent, @driya_ai, @balupton, @joshp123 외 다수
- GitHub: github.com/ngutman/openclaw-ha-addon, github.com/joshp123/padel-cli

*리서치: Codex CLI (gpt-5.3-codex), 2026-02-21*
