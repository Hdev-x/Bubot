# 정리 Track 브리핑 — 2026-09-03 ~ 09-05

> 대상: `work-status/ROADMAP.md` 정리 Track(T-04a~i), Work Package wp-03~wp-08, 독립 리뷰 5라운드와 수정 PR #60~#65.
> 기준 commit: 시작 `1cb358d`(wp-03 PLAN 작성 직후) → 종료 `0de5385`. 수치는 두 commit의 트리를 직접 계산했다.

## 1. 한 줄 요약

팀 프로젝트에서 넘어온 프론트엔드 한 덩어리(`styles.css` 8,591줄·`WebApp.tsx` 1,811줄·`src/` 최상위 폴더 15개)를 계층 구조·컴포넌트 옆 CSS·400줄 이하 파일로 재편했고, 그 과정에서 리뷰가 잡아낸 P0 2건(CSS cascade 뒤집힘)과 서버 실시간 중계·Binance 차단 처리 결함을 함께 고쳤다. 화면·동작은 사용자 육안 확인 기준으로 변경 전과 같고, 자동 검사(테스트 25→51, CSS 검사기, CI)가 회귀를 막는 장치로 남았다.

## 2. 전과 후

| 항목 | 전 (`1cb358d`, 09-03) | 후 (`0de5385`, 09-05) |
|---|---|---|
| `apps/web/src` 최상위 | 15개 항목(`components`·`pages`·`web`·`utils`·`drawing`·`types`·`contexts`…) | 6개(`app`·`chart`·`hooks`·`api`·`shared`·`assets`) + `config` |
| 진입점 | Mobile `main.tsx` + Desktop `web/` 혼재 | `app/mobile/main.tsx`·`app/desktop/main.tsx`, Vite 설정 2개 |
| CSS | 2파일 11,075줄(`styles.css` 8,591·`web.css` 2,484) | 15파일 7,326줄(셸 `mobile.css` 1,660·`desktop.css` 540 + 컴포넌트 옆 13개). 미사용 242 규칙 삭제, labs 전용 148 규칙 보존 이동 |
| 가장 큰 TS 파일 | `WebApp.tsx` 1,811 · `MarketChart.tsx` 1,585 · `useAutoPatterns.ts` 990 · `OrderPage.tsx` 910 · `WebDrawingToolbar.tsx` 640 | `MarketChart.tsx` 1,339 · `useAutoPatterns.ts` 695 · `DesktopApp.tsx` 461 · `OrderPage.tsx` 417 · DrawingToolbar → 3파일(133·147·373) |
| TS/TSX 파일 수 / 줄 | 140 / 22,728 | 173 / 22,601 (파일은 늘고 총량은 같음 — 이동·분해, 로직 추가 거의 없음) |
| Desktop 이름 | `WebApp`·`web.html`·`build:web`·`dist-web`·`web-*` 식별자 | `DesktopApp`·`desktop.html`·`build:desktop`·`dist-desktop`(URL `/web`은 배포 때) |
| Desktop 현재가 소스 | 차트 캔들 훅의 부산물(TF·캔들 로드에 묶임) | `useLivePrice`(티커 REST seed + 티커 WS), 조립 순서 현재가 → 캔들 → 호가 → 헤더 |
| Web 테스트 | 4파일 22개 | 5파일 30개 |
| API 테스트 | 1파일 3개(컨텍스트) | 4파일 21개(guard 11·WsConnect 3·ReconnectPolicy 4·컨텍스트 3) |
| lint 경고 | 320 (error 0, CI 포함) | 250 (error 0) |
| 자동 검사 | test·build 2종·lint·번들 문자열 grep | + `check:css` 4종(원본 순서·import 순서·번들 셸 선행·최종 선언/media), CI 연결 |
| 서버 실시간 중계 | 재연결 실패 시 영구 정지(플래그 고착), Binance 429/418 무시 | 백오프·타임아웃·유령 소켓 차단·종료 직렬화·무수신 점검, `BinanceRestGuard`(캐시·in-flight 공유·차단 존중·stale 나이) |
| PR / commit | — | 49 PR squash merge(#24~#72), 3일(09-03 10 · 09-04 15 · 09-05 24) |

## 3. 진행 과정

### 3.1 Work Package 6개

| WP | 내용 | PR | 핵심 결정 |
|---|---|---|---|
| wp-03 폴더 구조 | `app/{mobile,desktop}`·`chart`·`hooks/{market,account,ui}`·`api/{client,server,exchange}`·`shared` 계층 우선 재편, dead code 8파일 삭제 | #24~#30 | D-20260903-09(계층 우선), D-20260903-10(`chart/analysis` 재수출 유지) |
| wp-04 CSS 정리 | 미사용 규칙 삭제, labs 규칙 보존 이동, 지표 시트 공통 CSS, Mobile·Desktop CSS를 컴포넌트 옆으로 분할 | #32~#37 | D-20260904-01(CSS co-location), D-20260904-02(labs CSS 보존), 토큰 통합 생략(사용자) |
| wp-05 이름 통일 | Desktop을 뜻하는 `web` → `desktop`(파일·컴포넌트·빌드·산출물) | #39~#42 | URL `/web`·`static/web`은 배포(T-05)에서 |
| wp-06 DesktopApp 분해 | 1,811 → 451줄. panels 9·hooks 6·lib 6 파일, props 묶음 방식 | #44~#51 | D-20260905-01(451줄 마감, 묶음 props) |
| wp-07 큰 파일 분해 | DrawingToolbar 3파일, useAutoPatterns 990→695, OrderPage 911→417, MarketChart 1,585→1,332 | #53~#59 | 650줄 effect·차트 초기화 effect는 "한 흐름"이라 유지 |
| wp-08 현재가 분리 | `useLivePrice` 신설, Desktop 조립 순서 변경, `useCoinCandles` 캔들 전용화 | #67~#71 | A안(소스 교체), 등락 기준은 캔들 1Dutc 시가 유지 |

Fast Path 2건: #52 중계 재연결 보강(`ReconnectPolicy`·`WsConnect`), #56 Binance REST 캐시·429/418 존중.

진행 방식은 모든 WP에서 같았다. Delivery마다 "받을 것·돌려줄 것" 표를 사용자와 확정 → 한 PR → Gate(test·build·lint·번들 grep·labs tsc·dev 서버 렌더링) → 사용자 로그인 육안 확인 → squash merge.

### 3.2 리뷰 5라운드와 수정 PR

| 라운드 | 리뷰어 | 결과 | 수정 |
|---|---|---|---|
| 1차 (09-05) | gpt-5.6-sol 1명 | P0 2 · P1 7 · P2 9 | #60(CSS·RSI) #61(guard·중계) #62(P2·문서) |
| 2차 | sol 3 + gpt-6-astra 3 | P0 해소, P1 잔여(수정이 낳은 것 포함) | #63 |
| 3차 | astra 3 | P1 6 | #64 |
| 4차 | astra 3 | P1 4~5 | #65 |
| 5차 (#65 브랜치) | astra 3 | P1 3 → 같은 PR에 반영, 잔여 1건 OQ 이관 | #65 추가 commit |
| 최종 (09-05, 전체) | astra 3 | 4절 참조 | — |

라운드마다 남는 P1이 줄었지만 0이 되지 않아, 사용자 결정으로 5차에서 루프를 닫았다. 마지막에 남긴 것은 설계 변경이 필요한 두 건(OQ-20260905-04·06)이다.

## 4. 무슨 문제가 있었고 어떻게 해결했나

### 4.1 리팩터링이 만든 회귀 (리뷰가 잡음)

| 문제 | 원인 | 해결 | 재발 방지 |
|---|---|---|---|
| **P0** Mobile 차트 페이지 테마·하단 여백이 덮임, 현재가 라벨 flex가 inline-block으로 | wp-04 d03에서 `main.tsx`가 셸 CSS를 컴포넌트 import 뒤에 두어 번들 순서가 뒤집힘. 검증이 로그인 화면 computed style만 대조해 놓침 | #60 셸 CSS import를 `createRoot` 바로 뒤로, media 규칙 이동 | `check:css` 4종(원본 순서·진입점 import 순서·번들 셸 선행·최종 선언/media)을 npm script·CI에 연결. 검사기 자체도 3번 지적받아 보강(import 순서 미검사 → 같은 파일 내 순서 → 최종값·media 정확 비교) |
| **P1** 첫 렌더 RSI 페인이 빔 | wp-07 d04에서 RSI 데이터 effect를 훅으로 옮기며 초기화 effect보다 앞으로 감. 당시 "독립 대상이라 영향 없음"으로 오판 | #60 원위치 | PLAN AC-002에 오판 명시, effect 순서 변경 예외를 문서화 |
| **P2** 역방향 import(`shared → chart`) | 파일 이동 시 테스트·유틸이 chart 타입을 참조 | #62 `swingMarkers`, #63 `pivots.test.ts`를 `chart/analysis`로 | AC-005 import 방향 grep |
| **P2** wp-05 "잔여 web 식별자 0" 기록이 틀림 | 검사 grep이 경로 `apps/web`을 걸러내며 모든 줄을 지운 것으로 추정 | #62 실제 잔여(`web-root`·`webChartRef`·`WEB_*`) 정리, Acceptance에 예외(localStorage `web_*`·CSS `web-*`) 정식 반영 | 원인은 재실행 확인이 아니라 추정으로 표기 |
| **P2** PLAN Evidence로 required Acceptance를 낮춤(스크린샷 Gate·중복 선택자 0·줄 수) | 완료 시 사실과 다른 기록을 Evidence에 덧붙임 | #63~#65 Acceptance 정식 변경 + 승인 근거, Evidence를 revision별로 분리 | COMMON 규칙: "Evidence는 Acceptance를 낮출 수 없다" |

### 4.2 리팩터링 중 드러난 기존 결함 (사용자가 실제 겪음)

| 증상 | 원인 | 해결 |
|---|---|---|
| Mobile 차트·마켓·관심목록이 실시간으로 안 바뀜 | 서버 중계 3개(Bitget·Binance 티커·kline)가 끊긴 뒤 재연결 실패 → "재연결 중" 플래그 고착, 포트 고갈. Mobile은 모든 실시간 데이터가 이 중계 의존 | #52 `ReconnectPolicy`(백오프 3s→60s, fail/success로 플래그 해제)·`WsConnect`(15초 타임아웃)·무수신 점검 |
| 호가·TF 전환이 느려지고 관심종목 목록이 사라짐 | 브라우저가 0.5초마다 호가를 요청하고 서버가 매번 Binance를 호출 → 분당 150~250회 → 429 → 418 IP 차단(약 73분). 티커가 빈 목록으로 오면 관심종목도 빔 | #56·#61 `BinanceRestGuard`(호가 0.4s·캔들 1s·티커 10s 캐시, 동시 요청 in-flight 공유, 429/418 Retry-After 존중, 차단 중 마지막 값 유지), 부트스트랩 REST 상태코드 검사 |
| (리뷰 발견) 유령 소켓·종료 후 재연결·stale 나이·kline 구독 경합 | `cancel()` 뒤 `thenAccept`는 실행되지 않음, 종료 플래그 부재, fallback이 요청 전 시각 사용, refcount get/put 비원자 | #63~#65 `WsConnect.Attempt`(열린 소켓 기억·포기 시 abort), stop/connect 직렬화, 응답 시점 stale 재판정, kline `refLock` + 전송 큐, price-precision 거래소·상품군별 캐시 |

### 4.3 반복된 실수 패턴과 배운 것

1. **검증 범위가 좁으면 통과해도 안심할 수 없다.** 로그인 화면만 대조한 computed style이 P0를 놓쳤고, 셸↔컴포넌트만 보던 검사기가 같은 파일 내 재배치를 놓쳤다. 이후 "리뷰어가 통과시킨 입력을 실제로 재현해 검사기가 잡는지" 확인하는 방식으로 바꿨다.
2. **수정이 반쪽이면 다음 라운드에 그대로 돌아온다.** `useOrderbook`만 비우고 표시 ref는 안 비운 것, `GuardedListener`가 플래그만 바꾸고 소켓을 잡지 않은 것, stale 나이를 요청 전 시각으로 판정한 것. 데이터가 화면까지 닿는 경로 전체를 따라가야 한다.
3. **문서는 사실만.** "잔여 grep 0", "cascade 변화 0", "독립 대상이라 영향 없음"은 확인 없이 적은 결론이었다. 정정 시에도 Evidence 덧붙이기가 아니라 Acceptance를 바꾸고 승인 근거를 연결해야 한다.
4. **리뷰 루프는 수렴하지 않는다.** 라운드마다 더 좁은 경합이 나온다. 실제 사용자가 겪은 문제가 해결됐고 남은 것이 "타이밍이 겹치면 터지는" 종류라면 OQ에 위험을 명시하고 닫는 결정이 필요했다(5차에서 사용자 결정).
5. **AI 리뷰어의 강점은 정합성.** 세 리뷰어가 같은 저장소 규칙(COMMON)을 읽고 PLAN 모순을 잡았고, Vite `write:false` 번들·hook 메모리 실행으로 주장을 검증했다. 약점은 실행 재현 없이 정적 추정으로 P1을 만드는 것 — 원문 재확인이 항상 필요했다.

## 5. 최종 리뷰 (gpt-6-astra 3명, main@0de5385, 증분이 아닌 전체 상태)

세 명 모두 **P0 0**, "구조 정리는 양호·실체 확인"이면서 "안정화 완료로는 부족"이라는 판정이다. 이전 라운드 원문을 주지 않았는데도 같은 결론에 도달했다.

| 관점 | 판정 | 핵심 지적 |
|---|---|---|
| 프론트 | P1 4 · P2 2 | 계층 규칙·CSS 배치·진입점은 AST(import 520개)와 Vite 번들로 검증해 위반 0. 남은 P1은 **비동기 데이터의 식별·준비·복구 경계**: ① 캔들 식별자가 `symbol|TF`라 같은 심볼로 거래소를 바꾸면(Bitget BTCUSDT → Binance BTCUSDT) 캔들이 섞이고 늦은 응답이 덮음(메모리 재현), ② `useLivePrice`의 `readySymbol`이 심볼만 돌려줘 같은 상황에서 이전 거래소 가격이 준비 판정을 통과, 탭 타이틀엔 준비 판정 자체가 없음, ③ 현재가 seed가 실패하면 재시도 없이 WS 틱을 계속 버림, ④ `dailyOpen`이 seed 때만 설정돼 일봉이 넘어가도 등락 기준이 안 바뀜. P2: 미참조 API 함수 6개(`fetchStockChart` 등), PWA manifest 아이콘 파일 없음 |
| API | P1 8 · P2 1 | 재연결·차단·캐시 장치 자체는 타당("불필요한 복잡성 아님"). 남은 것은 **연결 성공·구독 성공·데이터 신선도·실패 복구 계약이 서비스 경계에서 이어지지 않는 것**: WS 스냅샷이 신선도 검사 없이 REST 가격을 덮음, 일부 SUBSCRIBE 실패가 다른 스트림 수신에 가려짐, KRW 캔들 API `count=0`으로 캐시 키 무한 증가, Bitget JSON 오류 응답이 빈 목록으로 해석돼 구독 축소, kline 소유자 매핑과 refcount 비원자, precision stale 응답이 다시 1시간 캐시, 서버 대기(최대 20초)와 클라이언트 timeout(12초) 불일치. 테스트 21개는 서비스 조합·경합을 보호하지 못함 |
| 프로세스·문서 | P2 5 | ROADMAP 완료 연결·정식 변경 기록은 맞음. wp-04 육안 Gate가 수정 후 재확인 없이 `passed`, wp-08 AC-003·설계 본문이 최종 구현(`candlesSymbol`, 캔들 시가 우선)과 미동기, `revision: working-tree`·`main` 54곳, CURRENT·OQ의 낡은 포인터(`WebApp.css`·`wp-03`), README 포트·경로 안내 불일치 |

리뷰어 3이 정리한 "다음 WP에서 지킬 규칙" 후보: 변경한 기능이 실제로 보이는 상태(로그인·첫 진입·전환)를 검증한다 / 본문 불변과 동작 불변을 구분한다 / Acceptance 변경을 완료 판정보다 먼저 반영한다 / 검색 결과 0건을 믿기 전에 검출 능력을 확인한다 / 종료 시 Evidence revision과 다음 행동을 함께 고정한다.

리뷰 원문: 세션 scratchpad `review7-astra-output-{1,2,3}.md`(저장소 밖).

## 6. 남은 것

최종 리뷰가 새로 낸 P1(프론트 4·API 8)은 리팩터링이 만든 회귀가 아니라 원래 있던 경계 결함이 대부분이고, wp-08이 만든 것은 ②·③·④다. 이것들은 정리 Track 밖의 새 작업이라 여기서는 목록만 남긴다. 리뷰어 1의 추천 순서는 "데이터 식별자·준비 판정 통일과 경계 테스트 → dead API 제거·중복 유틸 통합 → 공용 UI·CSS 소유 위치 정리"다.

- 배포(T-05·T-06): 보류. 배포 대상·도메인·DB 위치(OQ-20260903-04), `static/web` 산출물(OQ-08), `VITE_BOT_API_TOKEN` 노출(OQ-09)은 배포 계획에서 함께.
- 정리 후보(OPEN-QUESTIONS): lint 경고 250(OQ-11), 셸 CSS 중복 선택자 90(OQ-20260904-01), "Bullum" 문구(OQ-10), legacy DB(OQ-06).
- 서버 설계 문제(OQ-20260905-01~06): Binance 24h vs UTC 기준, 부트스트랩 완료 전 success, Bitget 목록 부분 실패, kline 전송 실패 정책, RSI 재생성·ping 중복, 늦은 `onOpen`의 `reconnect.success`.
