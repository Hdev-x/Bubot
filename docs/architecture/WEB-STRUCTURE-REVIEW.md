# apps/web 폴더 구조 검토 (2026-09-03)

> 리팩터링 설계 1단계 자료. 현재 구조를 사실대로 적고, 문제와 목표 구조 후보를 비교한다. 결정은 `work-status/DECISIONS.md`에 기록한다.
> 수치는 `git ls-files apps/web/src`와 import 그래프 분석 결과다.

## 1. 현재 구조

```text
src/
├── main.tsx  App.tsx            Mobile 진입점 (탭 라우팅, 6 pages)
├── web/                         Desktop 진입점 — main.tsx, WebApp.tsx(1,811줄), WebLogin, WebSignup, web.css(2,484줄)
│   └── components/              Desktop 전용 패널 7개 (WebDrawingToolbar 640줄, WebMarketPanel, WebWatchlist …)
├── pages/                       Mobile 페이지 6개, 2,692줄 (OrderPage 910, AssetsPage 686)
├── components/                  22개 5,494줄 — 차트(MarketChart 1,585)·오버레이 4·시트 8·기타
│   ├── chart-hooks/             useAutoPatterns(990), useIndicators
│   ├── indicators/              지표 설정 UI 7 + settings.ts
│   ├── trade/                   Mobile 거래 화면 부품 14개
│   ├── coin-list/               Mobile 마켓 목록 부품 9개
│   └── settings/                ApiKeyManager
├── drawing/                     차트 드로잉 엔진 6개 (Drawing 494, DrawingManager 298)
├── hooks/                       20개 — 시세·캔들·호가·계좌·UI 유틸 훅이 한 폴더에
├── api/                         18개 — 서버 호출 래퍼 + 거래소 직접 호출 + WebSocket 구독
├── utils/                       14개 — 포맷터·차트 계산 re-export·테스트 파일 4개
├── types/  constants/  contexts/  config/
└── styles.css (8,591줄)
```

| 구분 | 파일 | 줄 |
|---|---|---|
| Mobile 전용 (App·pages·components/trade·coin-list 등) | 53 | 약 6,700 |
| Desktop 전용 (web/) | 11 | 약 3,800 |
| 공용 (차트·지표·드로잉·api·hooks·utils·types) | 68 | 약 9,000 |
| 어느 진입점도 안 씀 (dead) | 13 | — |

공용 68개가 핵심 자산이다. 차트 스택(`MarketChart`·오버레이·`chart-hooks`·`indicators`·`drawing`), 데이터 계층(`api`·`hooks`), 타입·포맷터가 여기 속하고 Mobile과 Desktop이 같은 것을 쓴다.

## 2. 의존 방향 (import 횟수 상위)

```text
pages → hooks 22, components 19, components/trade 13, api 9
web   → api 14, hooks 13, components 8, indicators 7, web/components 5
hooks → api 22
components/trade → api 12, hooks 9
```

- 방향은 대체로 화면 → 훅 → api로 내려간다. 역방향(`hooks → components` 2건, `components → hooks` 1건)은 예외로 확인 대상.
- 가장 많이 import되는 파일: `types/market.ts`(24), `api/authApi.ts`(17), `utils/coinFormatters.ts`(15), `constants/exchanges.ts`(14), `api/coinRealtime.ts`(11), `indicators/settings.ts`(11).

## 3. 문제점

1. **`components/`가 성격이 다른 것의 창고다.** 차트 엔진(MarketChart·오버레이·chart-hooks), Mobile 전용 시트(`*Sheet.tsx` 8개), 공용 지표 UI가 한 폴더에 있다. "차트"라는 공용 자산과 "Mobile 화면 부품"이 섞여 어디까지가 공용인지 폴더로 드러나지 않는다.
2. **Mobile과 Desktop이 다른 방식으로 나뉘어 있다.** Mobile은 `pages/` + `components/trade`·`coin-list`, Desktop은 `web/` 한 폴더에 앱·로그인·패널·CSS가 다 들어 있다. 같은 앱의 두 화면인데 기준이 달라 새 화면을 어디에 둘지 규칙이 없다.
3. **`hooks/`·`api/`·`utils/`가 평평하다.** `api/`에는 서버 호출(`authApi`·`mainTradeApi`), 거래소 직접 호출(`bitgetTicker`·`krwTickers`), WebSocket 구독(`coinRealtime`·`klineRealtime`)이 섞여 있다. `hooks/` 20개도 시세·계좌·UI 유틸이 구분 없이 있다. `utils/`는 `shared`를 re-export하는 5줄짜리 파일과 테스트 파일이 섞여 있다.
4. **거대 파일.** `WebApp.tsx` 1,811줄(Desktop 전체가 한 컴포넌트), `MarketChart.tsx` 1,585줄, `useAutoPatterns.ts` 990줄, `styles.css` 8,591줄 + `web.css` 2,484줄. 폴더를 옮겨도 이건 남는다. 별도 주제.
5. **dead code 13개.** `OrderTicket`·`SpotTicket`·`FloatingToolbar`·`DrawingSettingsSheet`·`walletApi`·`toast.ts`·`PlaceholderPage`·`config/features.ts`는 어느 진입점에서도 도달하지 않는다(테스트 4개·`vite-env.d.ts`는 정상). `features.ts`는 d01에서 만들었지만 실제로 쓰는 곳이 없다.

## 4. 목표 구조 (2026-09-03 확정, 계층 우선)

논의 결과: `api/`·`hooks/`는 바깥 계층 폴더로 두고 안을 나눈다(계층 우선). `components/` 전역 폴더는 없애고 차트 스택은 `chart/`,
앱 전용 UI는 `app/*/components/`로 가른다. `api/`는 "누구를 부르는가"(서버 vs 거래소 직접) 기준, `hooks/`는 "무슨 데이터인가" 기준으로 나눈다.
CSS는 쓰는 코드 옆에 두는 것을 목표로 하되 이 WP에서는 앱별 파일을 통째로 옮기고, 컴포넌트별 분리는 wp-04에서 한다. `:root` 변수는 두 앱 값이 달라 앱별로 유지한다(2026-09-03 확인). 클래스 이름은 바꾸지 않는다.

```text
apps/web/src/
├── app/
│   ├── mobile/
│   │   ├── main.tsx  App.tsx
│   │   ├── pages/            CoinListPage · CoinChartPage · OrderPage · AssetsPage · LoginPage
│   │   ├── components/       BottomTabBar · ProfileMenu · PullToRefresh · UpdateToast · ErrorBoundary · TotalAssetHero · StrategyComingSoon · ApiKeyManager
│   │   │   ├── sheets/       DrawingSheet · TimeframeSheet · SymbolSearchSheet · ObjectTreeSheet · AnalysisHubSheet
│   │   │   ├── coin-list/    (9개)
│   │   │   └── trade/        (14개)
│   │   └── styles/           mobile.css (← styles.css 통째. 컴포넌트별 분리는 wp-04)
│   └── desktop/
│       ├── main.tsx  WebApp.tsx  WebLogin.tsx  WebSignup.tsx
│       ├── panels/           WebMarketPanel · WebWatchlist · WebFavoritesPanel · WebDrawingToolbar · WebRsiSettings · marketShared · snapFloat
│       └── styles/           desktop.css (← web.css 통째. 분리는 wp-04)
├── chart/
│   ├── MarketChart.tsx  MarketChart.css
│   ├── overlays/             ChartOverlay · BBOverlay · AutoPatternOverlay · PriceTagOverlay
│   ├── hooks/                useAutoPatterns · useIndicators · useCoinCandles · useMtfCandles · useCandleLoader · useCoinDetailChart · useChartTheme
│   ├── indicators/           IndicatorSheet · indicators.css · settings.ts · 7 Section
│   ├── settings/             ChartSettingsSheet · ChartSettingsSheet.css
│   ├── drawing/              (6개)
│   └── analysis/             chartIndicators · harmonicPattern · elliottWavePattern · pivots (shared re-export, 후속 정리 후보)
├── api/
│   ├── client.ts             공통 fetch·토큰 헤더 (authApi에서 분리)
│   ├── server/               authApi · apiKeysApi · mainTradeApi · spotTradeApi · marketApi · coinRealtime  — Spring 컨트롤러와 1:1
│   └── exchange/
│       ├── bitget/           bitgetTicker · bitgetFunding · bitgetMergeDepth · bitgetSymbols · klineRealtime
│       ├── binance/          binanceSymbols
│       ├── krw/              krwTickers · krwRealtime
│       ├── headerTicker.ts
│       └── exchangeRate.ts
├── hooks/
│   ├── market/               useMarketTickers · useOrderbook · useRealtimePrices · usePricePrecision · useFundingRate · useUsdKrw
│   ├── account/              useMainTrade · useSpotTrade · useSpotValueUsdt · useWatchlist
│   └── ui/                   usePersistentState · useScrollLock · usePageVisible · useDelayedReady · usePolledData
├── shared/
│   ├── ui/                   (양쪽이 같은 모양으로 쓰는 조각만, 초기엔 비어 있음)
│   ├── contexts/             CurrencyContext
│   ├── types/                market · bot
│   ├── constants/            exchanges
│   └── utils/                coinFormatters · sheetMotion · rsiCandles · swingMarkers · movingAverages (+tests) · pivots.test
├── config/                   accountTargets · chartPolicy
├── assets/
└── vite-env.d.ts
```

삭제: `OrderTicket` · `SpotTicket` · `FloatingToolbar` · `DrawingSettingsSheet` · `walletApi` · `toast.ts` · `PlaceholderPage` · `config/features.ts`, `styles.css`의 Strategy·Backtest·Live·Paper 구역.

규칙: import는 `app → chart/hooks → api → shared`로만. 앱 전역 CSS는 `app/*/styles/`, 공용 컴포넌트 CSS는 컴포넌트 옆. 클래스 이름 변경은 별도 주제(CSS Modules 또는 접두어).

4절 트리는 2026-09-03 d06(PR 예정)까지 그대로 적용됐다. 차이는 둘이다. `shared/ui/`는 만들지 않았고(wp-04에서 필요 시), `chart/analysis/` 재수출 4개는 유지하기로 했다(2026-09-03 결정: 루트 `shared/` 경로가 화면 코드에 퍼지지 않게 막는 단일 통로).

## 5. 실행 순서

`work-status/work/refactor/wp-03-web-structure/PLAN.md`가 정본이다. d00 dead code → d01 api → d02 hooks → d03 chart → d04 app/mobile + CSS 분할 → d05 app/desktop + CSS 분할 → d06 shared·규칙.
Gate는 tests 22·build 2종·lint error 0·번들 문자열 검사, d03~d05는 앞뒤 스크린샷 대조를 더한다.
