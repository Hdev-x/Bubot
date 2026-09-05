# 미확정 질문

- 마지막 갱신: 2026-09-03 (OQ-05 닫음, OQ-04 후보 갱신, OQ-10 추가)

> 아직 결정하지 않은 사항과 사용자 확인이 필요한 내용을 기록한다. AI가 임의로 확정하지 않는다.
> 해결된 질문은 이 문서에서 제거하고, 닫는 commit·PR 본문에 `OQ-YYYYMMDD-NN → D-YYYYMMDD-NN`을 적는다.
>
> 문형: `- 질문: OQ-YYYYMMDD-NN <결정할 한 문장> | <관련 링크(선택)>`

## Git·CI

## 배포·제품

- 질문: OQ-20260903-04 Beta 배포 대상 — EC2는 꺼져 있고 후보는 (a) Intel iMac 홈 서버 + Docker Compose + Cloudflare Tunnel(도메인 구입 필요) 또는 Duck DNS(`autotradev.duckdns.org`) + 포트포워딩, (b) AWS Lightsail 서울 2GB(월 약 $7). 도메인 구입 여부와 `DB_URL`이 가리키는 PostgreSQL 위치가 정해지면 `wp-03` PLAN | `work-status/ROADMAP.md`

## 막지는 않음

- 질문: OQ-20260905-01 Binance 티커에서 WS 스냅샷(@kline_1d 기준 현재가·변동)이 REST 24h 티커 값을 무조건 덮는다(`applyBinanceUtcSnapshots`). 24h 롤링 기준과 UTC 일봉 기준 중 어느 값을 화면 기준으로 삼을지 | 2차 리뷰(sol·astra 2026-09-05) 기존 설계 지적, `BinanceMarketService`
- 질문: OQ-20260905-02 거래소 WS 4개가 구독 목록 REST·SUBSCRIBE 전송(부트스트랩) 완료 전에 `reconnect.success()`를 호출해 구독 0인 연결도 성공으로 남는다. 구독 완료 뒤 success로 바꾸고 실패 시 소켓을 끊을지 | 2차 리뷰 기존 설계 지적, `ReconnectPolicy` 사용처
- 질문: OQ-20260905-03 Bitget 구독 목록 REST 3개(spot·USDT·USDC) 중 하나가 실패하면 전체 갱신을 건너뛰는데(예외 전파), 부분 실패 시 남은 목록으로 구독을 축소할지 이전 목록을 유지할지 | 2차 리뷰 기존 설계 지적, `CoinRealtimeWebSocketService.loadSubscriptionArguments`
- 질문: OQ-20260905-04 kline 중계는 PR #64 `refLock`(상태 전이)·PR #65 연결별 전송 큐(refLock 안 enqueue → 단일 스레드 전송, onOpen에서 소켓 설치 + 재구독 snapshot)로 상태 순서 = 전송 순서를 맞췄다. 남은 질문: 전송 실패(5초 타임아웃)를 로그만 남기고 subscribed에 유지하는 것이 맞는지, 실패 시 소켓을 끊어 재구독시킬지 | 2차·4차·5차 리뷰, `BinanceKlineRelayService.Conn`
- 질문: OQ-20260905-06 `WsConnect.Attempt`에서 소켓 기록 뒤 `delegate.onOpen`은 lock 밖이라, 포기 직전에 통과한 콜백이 `reconnect.success()`로 다음 재연결 예약 상태를 풀 수 있다(매우 좁은 경합, 소켓 자체는 abort됨). success를 소켓 설치 시점에 결속하는 설계 변경을 별도 WP로 할지 | 4차 리뷰 P1
- 질문: OQ-20260905-05 소소한 기존 문제 묶음 — RSI를 켠 채 `MarketChart`가 in-place로 차트를 재생성하면 RSI 페인이 빌 수 있음(현재 호출부에서는 발동하지 않음), Bitget 텍스트 ping과 프레임 pong이 중복. 정리 시점 | 2차 리뷰 기존 설계 지적

- 질문: OQ-20260904-01 `mobile.css`·`desktop.css` 셸에 같은 선택자 90개가 남아 있다. 대부분 Desktop이 Mobile 호가창(`TradeOrderbook`) 규칙을 다른 값으로 덮는 override(`book-row`·`funding-rate-countdown`·`gauge-*` 등 10개 계열)와 `.up/.down` 같은 양 앱 공용 규칙이다. Desktop override를 `WebApp.css`로 옮겨 명시할지, 값을 통일할지(디자인 판단) | `wp-04-css-cleanup` Milestone 잔여

- 질문: OQ-20260903-11 lint warning baseline 320개(`no-explicit-any` 145, `react-hooks/refs` 82, `set-state-in-effect` 44, `no-useless-assignment` 8 등)를 어느 WP에서 줄이고 언제 `error`로 올릴지 | `apps/web/eslint.config.js`

- 질문: OQ-20260903-10 코드·문구에 남은 "Bullum"(`apps/web/package.json` name, `document.title`, 푸터)을 Bubot으로 통일할지 | D-20260903-06

- 질문: OQ-20260903-09 `apps/web/.env`의 `VITE_BOT_API_TOKEN`이 브라우저 번들에 노출되는 값인데 Beta에서 계속 프론트에 둘지, 서버 프록시(`/api/bot`)로만 쓰고 제거할지 | `apps/web/src/api/botApi.ts`

- 질문: OQ-20260903-08 `apps/api/src/main/resources/static/{web,index.html}`에 추적된 Desktop build 산출물을 Git에서 빼고 배포 시 생성할지, 아니면 계속 추적할지 (현재 bundle은 rename 전 `tpm_token`을 포함) | `work-status/work/refactor/wp-01-rename-tpm/PLAN.md`

- 질문: OQ-20260903-06 `MemberDTO.cash`(주식 예수금)·`members` 컬럼과 미사용 legacy DB 테이블을 언제 정리할지 (DB 변경 승인 필요)
- 질문: OQ-20260903-07 Private Worklog를 원본 저장소 worklog에 이어 쓸지 Bubot용으로 새로 만들지
