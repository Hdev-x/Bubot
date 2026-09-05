---
schema: ai-workflow/work-package@1
id: wp-09-market-key
title: 데이터 식별자·준비 판정 통일 — 캔들·현재가를 거래소|현선물|심볼|TF 키로 (최종 리뷰 프론트 P1 4건)
workstream: refactor
state: active
updated: 2026-09-06
depends_on: [wp-08-live-price]
supersedes: []
outcome: "차트 캔들·현재가·헤더·호가·지표 스테이징이 모두 '거래소|현선물|심볼|TF'(마켓 키)로 자기 데이터가 현재 선택 것인지 판정한다. 같은 심볼로 거래소나 현선물을 바꿔도 캔들이 섞이거나 늦은 응답이 새 차트를 덮지 않고, 옛 거래소 가격이 새 선택에 붙지 않는다. 현재가 seed가 실패해도 재시도로 복구되고, UTC 일봉이 넘어가면 등락 기준 시가가 갱신된다. 이 규칙은 순수 함수와 테스트로 고정된다."
acceptance:
  - "AC-001: 마켓 키 생성은 순수 함수 하나(chart/hooks/marketKey.ts — chartKey(exchange, isFutures, symbol, tf)·priceKey(exchange, isFutures, symbol))로 통일되고, useCoinCandles의 symbolKey·currentKey·requestKey·loadedKeyRef·candlesKeyRef와 useLivePrice의 readyKey가 전부 이 함수를 쓴다(문자열 조립 `${symbol}|${...}` 직접 사용 0, grep)."
  - "AC-002: 최종 리뷰가 재현한 시나리오 — Bitget BTCUSDT 캔들 표시 중 Binance BTCUSDT로 전환 → (a) 옛 거래소 WS 틱이 새 캔들에 붙지 않고, (b) 옛 거래소 refresh·loadMore 응답이 새 캔들을 덮지 않고, (c) 헤더·호가·탭 타이틀이 새 seed 전까지 옛 값을 유지하되 준비 판정은 통과하지 않는다 — 를 순수 상태 전이 테스트로 고정한다(useCoinCandles의 키 가드 로직을 candleState.ts로 분리)."
  - "AC-003: useLivePrice는 ready(현재 키의 seed 완료 여부, boolean)를 함께 반환하고 헤더·호가·탭 타이틀은 readySymbol === symbol 대신 ready를 쓴다. seed 실패·null이면 3초→30초 백오프로 재시도하고 선택 변경·비활성 시 취소한다. UTC 일봉이 넘어가면(다음 00:00 UTC + 5초) loadDailyOpen을 다시 실행해 dailyOpen을 갱신한다."
  - "AC-004: Desktop 차트 소수점·지표(mtf) 스테이징은 candlesSymbol이 아니라 candlesKey === 현재 chartKey로 판정한다. useMtfCandles의 mtfSymbol 비교도 같은 키로 맞춘다."
  - "AC-005: Mobile CoinChartPage·OrderPage 표시는 변경 전과 같다(Mobile은 거래소 전환이 Bitget↔Binance만 있고 현선물 전환은 productType으로 — 키에 포함되므로 동작은 같되 옛 응답 폐기가 더 엄격해진다). 사용자 육안 확인."
  - "AC-006: 각 Delivery 후 tests(30 + 신규)·build 2종·lint error 0·번들 제외 문자열 0·check:css·labs tsc가 유지되고 Desktop·Mobile dev 서버가 렌더링된다. import 방향 app → chart/hooks → api → shared 유지."
deliveries:
  - id: wp-09-d01-market-key
    title: "marketKey.ts·candleState.ts 신설 — useCoinCandles 키 가드를 마켓 키·순수 함수로, Desktop 스테이징을 candlesKey로 (양 앱 확인)"
    kind: git
    state: review
    repository: .
    depends_on: []
    branch: refactor/mk-d01-market-key
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "새 파일 chart/hooks/marketKey.ts(priceKey·chartKey·priceKeyOf·symbolOf·resolveExchange, 3 tests)·candleState.ts(INTERVAL_SECONDS 이동, canApplyPrice·canApplyCandle·shouldDropResponse·mergeRefresh, 6 tests — 최종 리뷰 시나리오 Bitget→Binance 같은 심볼: 옛 틱 거부·옛 응답 폐기·fetch 실패 시 현재가만). useCoinCandles 387→365줄: 키 문자열 5곳·ref 3개가 marketKey 하나로, 병합 로직은 mergeRefresh 호출로, candlesSymbol → candlesKey, 로드·WS·refresh·loadMore deps에 marketKey(거래소·현선물 포함). useMtfCandles: key 인자·mtfKey 반환. useDesktopCandles·DesktopApp(currentPriceKey·currentChartKey, 소수점 스테이징 candlesKey === currentChartKey, useMtfCandles에 priceKey)·ChartStage(mtfKey === priceKeyOf(candlesKey)). CoinChartPage 변경 없음(반환 이름 미사용). 표와 다른 점 없음"
        revision: working-tree
        observed_at: 2026-09-06
      - kind: parity-check
        locator: "[추가, 사용자 관찰 2026-09-06 Bitget 주봉 갭] candleState.classifyIncomingBar — WS 봉이 마지막 봉과 같으면 update, 정확히 다음 봉이면 append, 봉을 건너뛰었거나 간격이 어긋나면 직접 붙이지 않고 refresh(30초 레이트리밋 autoRefresh), 과거 봉 ignore. 1Mutc는 28~31일. 예전 규칙은 'TF 배수이면 몇 봉을 건너뛰어도 append'라 어긋난 자리에 봉이 생겼다. onTick·onKline 두 경로에 적용, detectGap 제거. REST 주봉(Bitget·Binance 동일 월요일 UTC)·Bitget WS candle1Wutc 시각은 정상 확인 — 갭은 WS 경로 추정"
        revision: working-tree
        observed_at: 2026-09-06
      - kind: command
        locator: "tests 42(30+12) · tsc · lint 0(경고 245) · build 2종 · 번들 문자열 0 · check:css 0 · labs tsc. 원시 키 문자열 grep 0(AC-001). Desktop 비로그인 dev: 캔버스 7·h1 1·탭 타이틀 정상. 같은 심볼 거래소·현선물 전환은 거래소 버튼이 로그인 패널 안이라 사용자 확인으로"
        revision: working-tree
        observed_at: 2026-09-06
  - id: wp-09-d02-live-price
    title: "useLivePrice — ready(키 기준)·seed 재시도·일봉 롤오버 갱신, Desktop 소비처 ready로 (Desktop 확인)"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-09-d01-market-key]
    branch: refactor/mk-d02-live-price
    pull_requests: []
    evidence: []
  - id: wp-09-d03-boundary-tests
    title: "경계 시나리오 테스트 — 전환·늦은 응답·seed 실패·롤오버를 candleState·livePriceState 테스트로 고정, 문서"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-09-d02-live-price]
    branch: refactor/mk-d03-boundary-tests
    pull_requests: []
    evidence: []
milestones:
  - id: market-key-done
    title: "식별자·준비 판정 통일 완료"
    state: pending
    depends_on: [wp-09-d03-boundary-tests]
    acceptance:
      - "GATE-AC-001: AC-001(grep 0)·AC-002/AC-003 테스트·AC-006 Gate 자동 검사."
      - "GATE-AC-002: 사용자가 Desktop 로그인 후 같은 심볼로 Bitget↔Binance·현물↔선물 전환(BTCUSDT·ETHUSDT), 다른 심볼 전환, 업비트↔빗썸 전환에서 캔들·헤더·호가·탭 타이틀이 섞이지 않는 것과, Mobile 차트·거래 탭이 변경 전과 같은 것을 육안 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# 데이터 식별자·준비 판정 통일

## 배경 (2026-09-05 최종 리뷰, `main 54821f3`)

리팩터링 전체 최종 리뷰(gpt-6-astra)의 프론트 P1 4건이 이 WP의 범위다. 모두 비동기 데이터가 "현재 선택 것인지"를 판정하는 규칙의 결함이다.

| # | 지적 | 현재 코드 |
|---|---|---|
| 1 | 캔들 식별자가 `symbol\|TF`라 거래소·현선물을 구분하지 않아, 같은 심볼로 거래소를 바꾸면 새 WS가 옛 캔들에 붙고 옛 refresh 응답이 새 차트를 덮음(메모리 재현) | `useCoinCandles.ts` 94·143·274·342행 — `symbolKey`·`currentKey`·`requestKey`가 전부 `${symbol}\|${timeframe.granularity}`, `loadedKeyRef`·`candlesKeyRef`·`prevSymbolKeyRef`도 같은 문자열 |
| 2 | `useLivePrice`의 `readyKey`는 거래소·현선물을 구분하지만 반환은 `readySymbol`(심볼만)이라 Bitget BTCUSDT → Binance BTCUSDT 전환 직후 옛 가격이 준비 판정을 통과. 탭 타이틀은 준비 판정 자체가 없음 | `livePriceState.readySymbolOf`, `useHeaderSnapshot.ts` 80행 `loadedSymbol === symbol`, `useOrderbookSnapshot.ts` 77행, `DesktopApp.tsx` 탭 타이틀 effect |
| 3 | seed(`fetchHeaderTicker`)가 실패·null이면 `readyKey`가 설정되지 않아 이후 WS 틱을 계속 버리고 재시도가 없음 | `useLivePrice.ts` `Promise.all(...).catch(() => {})` |
| 4 | `dailyOpen`이 seed 때만 설정돼 UTC 일봉이 넘어가도 등락 기준이 옛 시가 | `useLivePrice.ts` 효과 1개, 헤더의 `dayStats.todayOpen`(60초 갱신)과 기준이 갈라짐 |

wp-08에서 만든 것은 2·3·4, 1은 원래 있던 결함이다.

## 설계

### 마켓 키 (d01)

```ts
// chart/hooks/marketKey.ts — 순수 함수, React 없음
export type MarketExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
export function priceKey(exchange: MarketExchange, isFutures: boolean, symbol: string): string;      // 'BINANCE|F|BTCUSDT'
export function chartKey(exchange: MarketExchange, isFutures: boolean, symbol: string, tf: string): string; // 'BINANCE|F|BTCUSDT|1h'
export function symbolOf(key: string): string;
```

- `useCoinCandles`: `exchange`가 없으면 `isBinance ? 'BINANCE' : 'BITGET'`, 현선물은 `isFutures`(Mobile은 `productType`에서 이미 파생됨). `symbolKey`·`currentKey`·`requestKey`와 세 ref를 전부 `chartKey(...)`로. 로드·WS·refresh·loadMore effect deps에 `exchange`·`isFutures`가 들어간다(전환 시 재구독·재로드 — 지금은 같은 심볼이면 재로드가 안 되는 것이 버그의 뿌리).
- `useCoinCandles`의 키 가드(틱 반영 허용·캔들 병합 허용·늦은 응답 폐기)를 `candleState.ts` 순수 함수로 분리해 테스트한다: `canApplyTick(loadedKey, candlesKey, currentKey)`, `shouldDropResponse(prevKey, candlesKey, requestKey)`, `mergeRefresh(prev, next, tf)`(기존 병합 로직 이동).
- 반환 `candlesSymbol` → `candlesKey`(문자열 키). Desktop `chartDecimalsRef`·`ChartStage`의 mtf 비교는 `candlesKey === chartKey(현재 선택)`. `useMtfCandles`가 돌려주는 `mtfSymbol`은 `mtfKey`(priceKey)로 바꿔 같은 규칙.
- Mobile `CoinChartPage`는 반환 이름 변화만(`candlesSymbol` 미사용) — 동작은 옛 응답 폐기가 엄격해지는 방향.

### useLivePrice (d02)

- 반환에 `ready: boolean`(= `state.readyKey === priceKey(현재)`) 추가. `readySymbol`은 유지하되 Desktop 소비처(헤더 `allReady`, 호가 `obReady`, 탭 타이틀)는 `ready`로 바꾼다. 헤더·호가 훅의 props 이름은 `loadedSymbol` → `priceReady`.
- seed 재시도: 실패·null이면 `ReconnectPolicy`와 같은 백오프(3s → 30s 상한)로 재시도. 선택 변경·`enabled=false`·언마운트 시 타이머 취소. `livePriceState`에 `seedAttempt` 카운트를 두지 않고 훅 안 ref로.
- 일봉 롤오버: `enabled`인 동안 다음 00:00 UTC + 5초에 `loadDailyOpen`을 다시 실행해 `applyDailyOpen(state, key, value)`(신규 순수 함수, 키 일치 시만 갱신). 헤더 `dayStats`(60초 폴링)와 기준이 같아진다.

### 경계 테스트 (d03)

- `candleState.test.ts`: 최종 리뷰 시나리오(Bitget → Binance 같은 심볼: 옛 WS 틱 거부, 옛 refresh 응답 폐기, 새 REST 뒤 옛 응답 무시), TF 전환, 현선물 전환, 3Dutc 앵커·1M 예외는 기존 동작 유지.
- `livePriceState.test.ts` 확장: 키 기준 ready, 옛 거래소 가격이 새 선택에 붙지 않음, `applyDailyOpen` 키 불일치 무시.
- `marketKey.test.ts`: 파생 규칙(exchange 없을 때, productType→현선물).

## 진행 방식

- Delivery마다 "받을 것·돌려줄 것" 표를 사용자와 확정한다(d01·d02). d03은 테스트·문서만.
- 동작 변경 WP다(wp-08과 같음). Gate 뒤 사용자 육안 확인이 merge 조건이며, 확인 시나리오는 "같은 심볼로 거래소·현선물 전환"을 반드시 포함한다.
- 순수 함수 분리 방식은 `livePriceState`(wp-08 d01)와 같다 — React 훅 테스트 의존성은 추가하지 않는다.
- 제외: API 쪽 P1(B, 별도 WP), 헤더 `allReady`가 시가총액까지 기다리는 체감 순서(변경 없음), Mobile 현재가 소스(차트 종가 유지), `useOrderbook` 폴링 키(이미 `exchange|symbol|isFutures`).

## Delivery Notes

### wp-09-d01-market-key
- 새 파일: `chart/hooks/marketKey.ts`(+test), `chart/hooks/candleState.ts`(+test). 변경: `useCoinCandles.ts`(키·가드·병합 호출), `useDesktopCandles.ts`·`DesktopApp.tsx`·`ChartStage.tsx`(`candlesSymbol` → `candlesKey`), `useMtfCandles.ts`(`mtfKey`), `CoinChartPage.tsx`(반환 이름).
- 확인: Desktop BTCUSDT Bitget↔Binance·현물↔선물 전환에서 캔들 섞임 없음. Mobile 차트 전환.

### wp-09-d02-live-price
- 변경: `useLivePrice.ts`(ready·재시도·롤오버), `livePriceState.ts`(`applyDailyOpen`), `useHeaderSnapshot.ts`·`useOrderbookSnapshot.ts`(`priceReady`), `DesktopApp.tsx`(탭 타이틀 ready 가드).
- 확인: Desktop 전환 시 헤더·호가·탭 타이틀에 옛 거래소 가격이 붙지 않음. seed 실패 재시도는 네트워크 차단으로 재현하기 어려우면 테스트 evidence로.

### wp-09-d03-boundary-tests
- 테스트 추가·보강, STRUCTURE.md(`chart/hooks/marketKey·candleState`), COMMANDS 변화 없음.
