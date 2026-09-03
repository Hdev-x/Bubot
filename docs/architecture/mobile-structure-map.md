# Mobile Structure Map

작성일: 2026-05-31

이 문서는 현재 실제 사용 중인 `/mobile` React 앱을 기준으로 화면, API, 실시간 데이터, 봇 연동 흐름을 정리한 관리용 지도다. 목적은 기존 `tpm`에서 복사되어 남아 있는 JSP/stock/board/member/news/notice 잔해와 실사용 코드를 구분하고, 이후 정리 작업의 기준점을 만드는 것이다.

## 1. 실행 단위

현재 `/mobile`은 `apps/web`의 Vite 앱이다.

- 진입점: `apps/web/src/main.tsx`
- 라우팅/상태 연결: `apps/web/src/App.tsx`
- 빌드 기준 경로: `apps/web/vite.config.js`의 `base: '/mobile/'`
- 배포 흐름: `deploy.sh`가 `apps/web/dist`를 `apps/api/src/main/resources/static/mobile`로 복사한 뒤 WAR를 만든다.

Spring Boot의 기존 JSP 화면과 별개로, 실제 모바일 화면은 React 앱이 담당한다.

## 2. Route 지도

React 앱은 브라우저 hash 기반으로 화면을 전환한다.

| URL | 주요 파일 | 역할 |
| --- | --- | --- |
| `/mobile/` 또는 `#/` | `apps/web/src/pages/CoinListPage.tsx` | 코인 목록, 거래소/현물/선물 필터, 미니 차트 |
| `#/chart` | `apps/web/src/pages/CoinChartPage.tsx`, `apps/web/src/components/MarketChart.tsx` | 단일 심볼 차트, 지표, 드로잉, 분석 오버레이 |
| `#/orders` | `apps/web/src/pages/OrderPage.tsx`, `apps/web/src/pages/LivePage.tsx` | 봇 상태, 포지션/주문 탭, 실시간 봇 모니터링 |
| `#/strategy` | `apps/web/src/pages/StrategyPage.tsx` | 전략 백테스트, OB/FVG/엘리어트/하모닉 분석 |
| `#/assets` | `apps/web/src/pages/AssetsPage.tsx` | 봇 계정 자산, 메인 계정 잔고, 보유 심볼 평가 |

전역 선택 상태는 `App.tsx`가 들고 있다.

- `selectedSymbol`
- `selectedProductType`
- `selectedExchange`
- `selectedTickDecimals`

## 3. 프론트 핵심 파일

### 화면

- `CoinListPage.tsx`: 모바일 첫 화면. 거래소 선택, 티커 목록, 검색/정렬, 미니 차트까지 포함해 크고 복잡하다.
- `CoinChartPage.tsx`: 차트 화면의 상태 연결부. `MarketChart`, 지표 시트, 심볼 검색, 분석 허브를 연결한다.
- `MarketChart.tsx`: 차트 렌더링 핵심. 캔들, 드로잉, 지표, 오버레이 상태가 많이 모여 있어 분리 우선순위가 높다.
- `OrderPage.tsx`: 주문 탭 껍데기와 봇 상태 요약.
- `LivePage.tsx`: 실시간 봇 모니터링. Spring 봇 프록시(`/api/bot`, `/api/bot-ws`)와 실시간 가격 구독이 섞여 있다.
- `StrategyPage.tsx`: 백테스트/전략 실험 화면. 많은 계산과 UI가 한 파일에 몰려 있어 분리 후보다.
- `AssetsPage.tsx`: 봇별 자산 상태와 메인 계정 상태를 조회한다.

### API 모듈

- `apps/web/src/api/marketApi.ts`: Spring Boot API 호출 래퍼.
- `apps/web/src/api/coinRealtime.ts`: Spring STOMP WebSocket(`/ws-coin`) 구독 래퍼.
- `apps/web/src/api/botApi.ts`: Spring 봇 프록시(`/api/bot`, `/api/bot-ws`) 호출 래퍼.

### 전략/차트 유틸

- `apps/web/src/utils/backtestEngine.ts`
- `apps/web/src/utils/chartIndicators.ts`
- `apps/web/src/utils/elliottWavePattern.ts`
- `apps/web/src/utils/harmonicPattern.ts`
- `apps/web/src/components/ChartOverlay.ts`
- `apps/web/src/components/BBOverlay.ts`

## 4. Spring API 사용 지도

현재 `/mobile`이 직접 쓰는 Spring API는 대부분 코인 시세/캔들 API다.

| 프론트 함수 | HTTP 경로 | 백엔드 |
| --- | --- | --- |
| `fetchCoinTickers()` | `GET /coin/api/tickers` | `CoinController.getTickers()` |
| `fetchCoinFuturesTickers()` | `GET /coin/api/futures/tickers` | `CoinController.getFuturesTickers()` |
| `fetchBinanceSpotTickers()` | `GET /coin/api/binance/spot/tickers` | `CoinController.getBinanceSpotTickers()` |
| `fetchBinanceFuturesTickers()` | `GET /coin/api/binance/futures/tickers` | `CoinController.getBinanceFuturesTickers()` |
| `fetchPricePrecision()` | `GET /coin/api/price-precision` | `CoinController.getPricePrecision()` |
| `fetchCoinLogos()` | `GET /coin/api/logos` | `CoinController.getLogos()` |
| `fetchCoinCandles()` | `GET /coin/api/candles` | `CoinController.getCandles()` |
| `fetchBinanceCandles()` | `GET /coin/api/binance/{spot,futures}/candles` | `CoinController` |
| `fetchAllBinanceFuturesCandles()` | `GET /coin/api/binance/futures/candles` 반복 호출 | `CoinController.getBinanceFuturesCandles()` |

실제 구현 의존성:

- `apps/api/src/main/java/com/tj/app/market/coin/CoinController.java`
- `apps/api/src/main/java/com/tj/app/market/coin/CoinMarketService.java`

`apps/web/src/api/marketApi.ts`에는 `/stock/chart`, `/stock/ticker`, `/stock/db-list` 호출 함수도 남아 있지만 현재 주요 `/mobile` 화면에서는 호출되지 않는다. 레거시 또는 향후 재사용 후보로 본다.

## 5. 실시간 데이터 지도

프론트는 `apps/web/src/api/coinRealtime.ts`를 통해 `/ws-coin`에 STOMP로 접속한다.

백엔드 설정:

- `apps/api/src/main/java/com/tj/app/common/config/WebSocketConfig.java`
- endpoint: `/ws-coin`
- broker prefix: `/topic`

주요 구독 토픽:

| 프론트 함수 | 토픽 |
| --- | --- |
| `subscribeBitgetFuturesTickers()` | `/topic/coin-futures/{symbol}` |
| `subscribeBitgetSpotTickers()` | `/topic/coin/{symbol}` |
| `subscribeBinanceFuturesTickers()` | `/topic/binance-futures/{symbol}` |
| `subscribeBinanceSpotTickers()` | `/topic/binance-spot/{symbol}` |
| `subscribeCoinCandle()` | `/topic/coin-futures/{symbol}` 또는 `/topic/coin/{symbol}` |
| `subscribeBinanceCandle()` | `/topic/binance-futures/{symbol}` 또는 `/topic/binance-spot/{symbol}` |

관련 백엔드:

- `CoinRealtimeWebSocketService.java`
- `BinanceSpotRealtimeWebSocketService.java`
- `BinanceFuturesRealtimeWebSocketService.java`

## 6. Trader 봇 연동 지도

`/mobile`의 주문/자산/실시간 봇 화면은 Spring DB 주문 기능이 아니라 `trader`의 Node 서버 API를 본다.

공통 호출 래퍼:

- `apps/web/src/api/botApi.ts`

프록시 기준:

- 개발 서버: `apps/web/vite.config.js`의 `/api`, `/api/bot-ws` 프록시
- 운영 배포: Spring이 `/api/bot/**`, `/api/bot-ws/**`를 ADMIN JWT로 검증한 뒤 trader `/bot-api/...`로 중계

봇 심볼 매핑은 `OrderPage.tsx`, `LivePage.tsx`, `AssetsPage.tsx`에 중복으로 들어 있다.

| 심볼 | bot path | 기본 port |
| --- | --- | --- |
| `SOL` | `sol` | `3001` |
| `NEAR` | `near` | `3002` |
| `LTC` | `ltc` | `3003` |
| `WLD` | `wld` | `3004` |
| `INJ` | `inj` | `3005` |
| `BTC` | `btc` | `3006` |
| `1000SHIB` | `shib` | `3007` |

주요 경로:

- `/api/bot/{botPath}/api/status`
- `/api/bot/main/api/status`
- `/api/bot-ws/{botPath}/api/stream?token=<JWT>`
- `/api/bot-ws/main/api/stream?token=<JWT>`

관련 trader 파일:

- `labs/trading/worker/src/bot.ts`
- `labs/trading/worker/src/lib/api-server.ts`
- `labs/trading/worker/src/lib/state-store.ts`
- `labs/trading/worker/src/lib/signal-engine.ts`
- `labs/trading/worker/src/lib/order-executor.ts`

## 7. 레거시 잔해 후보

> 2026-09-02 갱신: 아래 JSP 화면·JSP용 정적 리소스는 TPM 잔해 정리(tag `tpm-legacy-last` 이후 commit 3개)에서 모두 삭제됐다.
> 경로는 역사 기록으로 남기며, `apps/api/src/main/webapp/`는 더 이상 존재하지 않는다. 경로 표기는 2026-09-02 폴더 이동
> (`frontend/`→`apps/web/`, `backend/`→`apps/api/`, `trader/`→`labs/trading/worker/`)에 맞춰 일괄 치환했다.

아래는 현재 `/mobile` 기준으로 직접 사용 흔적이 약한 영역이다. 바로 삭제하지 말고, 비활성화/빌드/런타임 확인 순서로 접근해야 한다.

### JSP 화면 (삭제됨)

- `apps/api/src/main/webapp/WEB-INF/views/stock`
- `apps/api/src/main/webapp/WEB-INF/views/coin`
- `apps/api/src/main/webapp/WEB-INF/views/board`
- `apps/api/src/main/webapp/WEB-INF/views/notice`
- `apps/api/src/main/webapp/WEB-INF/views/member`
- `apps/api/src/main/webapp/WEB-INF/views/news`
- `apps/api/src/main/webapp/WEB-INF/views/common`

### JSP용 정적 리소스 (삭제됨)

- `apps/api/src/main/resources/static/js/market`
- `apps/api/src/main/resources/static/css/market`
- `apps/api/src/main/resources/static/js/board`
- `apps/api/src/main/resources/static/css/board`
- `apps/api/src/main/resources/static/js/member`
- `apps/api/src/main/resources/static/css/member`
- `apps/api/src/main/resources/static/js/news`
- `apps/api/src/main/resources/static/js/common.js`
- `apps/api/src/main/resources/static/js/index.js`
- `apps/api/src/main/resources/static/js/sidebar-data.js`

### Spring 기능 영역

- `board`
- `notice`
- `news`
- `member`
- `market/stock`
- `market/stock/order`
- `market/index`
- `asset`
- `market/exchange`
- `market/community`
- `market/coin/order`

주의: `market/coin/order`는 기존 DB 기반 코인 매수/매도/지갑 기능이다. 현재 `/mobile`의 봇 주문/자산 화면은 `trader` API를 기준으로 보이므로 직접 의존성은 낮다. 단, 회원가입 시 지갑 생성 등 기존 Spring 흐름에 얽혀 있으므로 삭제 전 별도 확인이 필요하다.

## 8. 정리 우선순위

### 1순위: `/mobile` 구조 안정화

- 큰 파일 역할 분리 전 문서화 유지
- API 호출 위치를 `api/` 모듈로 모으기
- 봇 심볼 매핑 중복 제거
- `MarketChart.tsx`, `StrategyPage.tsx`, `LivePage.tsx`를 작은 단위로 점진 분리

### 2순위: 모바일 사용 API 분리

`CoinController.java`는 모바일 API, JSP 페이지, 기존 DB 주문 엔드포인트가 섞여 있다.

권장 분리 방향:

- `CoinApiController`: `/coin/api/...`
- `CoinPageController`: `/coin/chart`, `/coin/list` 같은 JSP 페이지
- `CoinTradeController`: `/coin/buy`, `/coin/sell`, `/coin/wallet` 같은 DB 기반 주문/지갑 API

당장 분리하지 않아도 되지만, 앞으로 Spring 쪽을 건드릴 때 기준으로 삼는다.

### 3순위: trader 봇 안정화

- 주문 발생 조건 문서화
- 재시작 후 포지션 복구 흐름 확인
- 중복 진입 방지 테스트
- env/API 키 관리 점검
- 실거래 관련 상수(`LEVERAGE`, `MIN_SIZE`, 심볼별 TP/SL) 위치 정리

### 4순위: 레거시 정리

삭제보다 먼저 비활성화를 우선한다.

1. 사용 여부 문서화
2. 설정으로 WebSocket/스케줄러/컨트롤러 영향 줄이기
3. `./gradlew test`, `frontend npm run build` 확인
4. 운영에서 `/mobile`, `/api/bot`, `/api/bot-ws` 정상 확인
5. 마지막에 파일 삭제

## 9. 즉시 주의할 점

- 주식 관련 서비스는 모바일에서 직접 안 쓰더라도 `@Scheduled`가 살아 있을 수 있다.
- JSP 파일은 안 쓰더라도 컨트롤러가 살아 있으면 외부 URL로 접근 가능할 수 있다.
- `application-dev.properties` 같은 로컬 설정 파일에는 비밀값이 들어 있으므로 정리 작업 중 공유/커밋에 주의해야 한다.
- `apps/api/src/main/resources/static/mobile`은 빌드 산출물이므로 직접 수정 대상이 아니다.
