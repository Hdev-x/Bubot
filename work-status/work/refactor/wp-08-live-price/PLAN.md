---
schema: ai-workflow/work-package@1
id: wp-08-live-price
title: 현재가 구독 분리 — useCoinCandles의 티커 현재가를 useLivePrice로 (T-04f)
workstream: refactor
state: completed
updated: 2026-09-05
depends_on: [wp-07-large-files]
supersedes: []
outcome: "Desktop의 현재가(헤더·호가 중앙·탭 타이틀)는 차트 TF·캔들 로드와 무관한 전용 훅 useLivePrice(거래소 티커 REST seed + 티커 WS)에서 나오고, DesktopApp은 '현재가 → 캔들·호가·헤더' 순으로 조립된다. useCoinCandles는 캔들 전용으로 줄어들고(priceFromTicker·헤더 티커 의존 제거), Mobile 차트의 현재가(차트 TF 종가)는 그대로다."
acceptance:
  - "AC-001: hooks/market/useLivePrice.ts가 신설되고(≤ 150줄), 거래소 4종(BITGET·BINANCE·UPBIT·BITHUMB)·현물/선물에서 seed(fetchHeaderTicker) → WS(subscribe*Tickers·subscribeKrwTickers) 순으로 현재가를 준다. 종목 전환 직후엔 옛 종목 값을 유지하다 새 seed가 오면 한 번에 바뀐다(스테이지드 스왑 유지)."
  - "AC-002: Desktop에서 헤더 현재가·등락, 호가 중앙가, 탭 타이틀이 useLivePrice 값을 쓰고, useDesktopCandles는 priceFromTicker 없이 캔들·일봉시가만 담당한다. DesktopApp 훅 호출 순서는 useLivePrice → useDesktopCandles → useOrderbookSnapshot → useHeaderSnapshot."
  - "AC-003: '준비된 종목만 표시'(loadedSymbol) 판정은 '현재가 seed 완료 && 일봉시가 로드 완료'로 정의하고 헤더·호가·차트 소수점 스테이징이 이 판정을 쓴다. 전환 중 옛 종목·새 종목 값이 섞여 보이지 않는다(육안)."
  - "AC-004: useCoinCandles에서 priceFromTicker·fetchHeaderTicker 의존이 사라지고 남는 livePrice는 '차트 TF 마지막 종가'만 뜻한다. Mobile CoinChartPage 동작·표시는 변경 전과 같다."
  - "AC-005: 각 Delivery 후 tests(22 + 신규)·build 2종·lint error 0·번들 제외 문자열 0·check:css·labs tsc가 유지되고, Desktop·Mobile dev 서버가 렌더링된다. d02·d03은 사용자가 로그인 후 양 앱 육안 확인(전환·현재가·등락·호가 중앙)."
  - "AC-006: import 방향 app → chart/hooks → api → shared 유지. useLivePrice는 hooks/market/에 두고 chart/를 import하지 않는다."
deliveries:
  - id: wp-08-d01-hook
    title: "hooks/market/useLivePrice.ts 신설 + 단위 테스트 (호출부 변경 없음)"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: refactor/lp-d01-hook
    pull_requests: [68]
    evidence:
      - kind: parity-check
        locator: "새 파일 3개 — hooks/market/useLivePrice.ts(56, React 훅: seed fetchHeaderTicker → 거래소별 티커 WS, enabled·symbol 가드), livePriceState.ts(38, 순수 상태 전이: applySeed·applyTick·livePriceKey·readySymbolOf), livePriceState.test.ts(7 tests: seed 전 틱 무시, seed→틱, 스테이지드 스왑, 늦은 seed 폐기, last 없음·openUtc 0, 같은 값 동일 객체, 키 구분). 기존 파일 변경 0, 호출부 0(grep). React 없이 테스트하기 위해 상태 전이를 훅에서 분리"
        revision: 37918dd
        observed_at: 2026-09-05
      - kind: command
        locator: "tests 29(22+7) · tsc ok · lint 0(경고 250) · build 2종 · 번들 문자열 0 · check:css 0 · labs tsc"
        revision: 37918dd
        observed_at: 2026-09-05
  - id: wp-08-d02-desktop
    title: "Desktop 전환 — DesktopApp이 useLivePrice로 현재가를 받고 캔들·호가·헤더에 넘김, loadedSymbol 재정의"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-08-d01-hook]
    branch: refactor/lp-d02-desktop
    pull_requests: [69]
    evidence:
      - kind: parity-check
        locator: "DesktopApp: useCandleLoader → useLivePrice(loadDailyOpen) → useDesktopCandles → useOrderbookSnapshot → useHeaderSnapshot 순으로 조립(451→461줄, +10: 로더·시가 로더·주석). useDesktopCandles: priceFromTicker 제거, loadCandles를 인자로 받음, 반환은 candles·candlesSymbol·timeframe·handleVisibleRangeChange. useCoinCandles: candlesSymbol state 추가(candlesKeyRef 설정 2곳에서 함께 갱신 — 표의 '새 상태 아님'과 다름: 렌더 중 ref 접근 lint 규칙 때문에 state 미러로). ChartStage: 지표(mtf) 스테이징 기준 loadedSymbol → candlesSymbol. 호가·헤더 훅은 props 이름 유지, 주석만"
        revision: c569f7f
        observed_at: 2026-09-05
      - kind: decision
        locator: "등락 기준 차이 발견·결정: 티커 openUtc 기준으로 바꾸면 Binance만 -2.04%(24h 롤링 openPrice) vs 캔들 1Dutc 시가 -0.02%로 달랐다(headerTicker.ts 31행 매핑). 사용자 결정 2026-09-05 1안: useLivePrice에 loadDailyOpen(loadCandles('1Dutc', 2) 마지막 시가)을 넘겨 캔들 시가 기준 유지, 티커 openUtc는 폴백. 현재가·시가를 Promise.all로 함께 기다린 뒤 커밋(섞임 방지). OQ-20260905-01(Binance 24h vs UTC)은 그대로 열어 둠"
        revision: c569f7f
        observed_at: 2026-09-05
      - kind: command
        locator: "tests 30(+1 시가 우선·폴백) · tsc · lint 0(경고 250, main과 같은 항목·줄 이동만) · build 2종 · 번들 문자열 0 · check:css 0 · labs tsc. Desktop 비로그인 dev 서버: 캔버스 7, 헤더·호가 중앙·탭 타이틀 같은 현재가, 등락 -0.05%(main 기준과 동일 방식). 콘솔 createRoot·removeChild 오류는 main에서도 동일(기존). 로그인 후 거래소 4종·현물/선물 전환은 사용자 확인. 전환 시 헤더는 24h 티커·일봉·시가총액까지 기다려 차트보다 늦게 바뀐다(d02 전과 동일, 사용자 관찰 2026-09-05 — PR 본문의 '헤더가 먼저' 문구는 오류로 정정)"
        revision: c569f7f
        observed_at: 2026-09-05
  - id: wp-08-d03-candles-cleanup
    title: "useCoinCandles 정리 — priceFromTicker·헤더 티커 제거, 현재가는 차트 종가만 (Mobile 확인)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-08-d02-desktop]
    branch: refactor/lp-d03-candles-cleanup
    pull_requests: [70]
    evidence:
      - kind: parity-check
        locator: "useCoinCandles.ts만 변경(387줄 유지). priceFromTicker 옵션·fetchHeaderTicker import·Promise.all의 티커 seed 분기 제거, 로드 effect deps에서 priceFromTicker·exchange·isBinance·isFutures 제거(티커 seed에만 쓰이던 것; exchange·isBinance·isFutures는 WS effect에서 계속 사용). livePrice = 차트 TF 마지막 종가(Mobile 경로, 변경 전 기본값과 동일). 저장소 전체 priceFromTicker 참조 0, fetchHeaderTicker 사용처는 useLivePrice·useHeaderSnapshot 2곳"
        revision: e7c2bd7
        observed_at: 2026-09-05
      - kind: command
        locator: "tests 30 · tsc · lint 0(경고 250) · build 2종 · 번들 문자열 0 · check:css 0 · labs tsc. dev 서버: Mobile 5175 로그인 화면 로드(스타일시트 12, 콘솔 오류는 비로그인 ws-coin만), Desktop 5174 캔버스 7·탭 타이틀 -0.02%. Mobile 차트 현재가·등락은 로그인 후 사용자 확인"
        revision: e7c2bd7
        observed_at: 2026-09-05
milestones:
  - id: live-price-split-done
    title: "현재가 구독 분리 완료"
    state: passed
    depends_on: [wp-08-d03-candles-cleanup]
    acceptance:
      - "GATE-AC-001: AC-001·AC-004·AC-005·AC-006 자동 검사(줄 수, useCoinCandles의 fetchHeaderTicker grep 0, Gate, import 방향 grep)."
      - "GATE-AC-002: 사용자가 Desktop 로그인 후 종목·거래소 전환(Bitget↔Binance↔업비트↔빗썸, 현물↔선물)에서 헤더 현재가·등락·호가 중앙·탭 타이틀이 함께 바뀌고 섞임·깜빡임이 없는 것, Mobile 차트 현재가·등락이 변경 전과 같은 것을 육안 확인."
    unlocks: []
    evidence:
      - kind: command
        locator: "GATE-AC-001: main e7c2bd7 — useLivePrice 61줄·livePriceState 38줄(AC-001 ≤150), useCoinCandles에 fetchHeaderTicker·priceFromTicker 0(AC-004), useLivePrice는 api/·shared/만 import(AC-006). 각 PR tests 29→30·tsc·lint 0(경고 250)·build 2종·번들 문자열 0·check:css·labs tsc·CI success(AC-005). AC-002 조립 순서 useCandleLoader → useLivePrice → useDesktopCandles → useOrderbookSnapshot → useHeaderSnapshot. AC-003 재정의: 헤더·호가는 readySymbol(현재가·일봉 시가 seed), 차트 소수점·지표는 candlesSymbol"
        revision: e7c2bd7
        observed_at: 2026-09-05
      - kind: manual-check
        locator: "GATE-AC-002: 사용자가 2026-09-05 로그인 후 확인 — d02 Desktop 전환(거래소 4종·현물/선물, 헤더·호가·탭 타이틀 현재가·등락, 섞임 없음; 헤더는 24h 티커·일봉·시가총액까지 기다려 차트보다 늦게 바뀌는 것은 d02 전과 동일), d03 Mobile 차트 현재가·등락 변경 전과 동일"
        revision: e7c2bd7
        observed_at: 2026-09-05
extensions: {}
---

# 현재가 구독 분리 (T-04f)

## 배경 (2026-09-05 조사, `main 12d44b9`)

`chart/hooks/useCoinCandles.ts`(387줄)는 캔들과 현재가를 한 구독으로 갱신한다.

| 구역 | 줄 | 하는 일 |
|---|---|---|
| 상태 | 68~87 | `candles`·`livePrice`·`openPrice`·`dailyOpenPrice`·`loadedSymbol`, 가드 ref 3개(`loadedKeyRef`·`candlesKeyRef`·`prevSymbolKeyRef`) |
| 로드 effect | 89~140 | 캔들 + 일봉 2개 + (Desktop `priceFromTicker`) 헤더 티커를 `Promise.all`로 받아 한 번에 커밋. 성공 시 `loadedKeyRef`를 열어 WS 반영 허용 |
| WS effect | 144~273 | 거래소별 구독 하나(kline 또는 티커)로 현재가와 캔들을 동시에 갱신 |
| 재조회 | 275~338 | 갭 감지·탭 복귀 refresh(30초 레이트리밋), `livePrice`를 종가로 덮음(303) |
| 페이징 | 340~375 | loadMore·visibleRange·clear |

Desktop은 이 `livePrice`·`loadedSymbol`을 `useOrderbookSnapshot`(호가 중앙)·`useHeaderSnapshot`(헤더)·탭 타이틀 effect에 넘긴다. 그래서 wp-06 d03에서 캔들 훅이 호가 훅 앞으로 와야 했다. 현재가가 캔들 로드에 묶여 있어 TF 전환·캔들 fetch 실패가 헤더·호가에 번진다.

사용자 결정(2026-09-05): **A안 — 현재가 소스를 전용 훅으로 교체**. B안(훅 내부 분리만, 소스 유지)은 호출 순서 문제가 남아 제외.

## 설계

### useLivePrice (d01)

```ts
// hooks/market/useLivePrice.ts
useLivePrice({ symbol, exchange, isFutures, enabled = true }): {
  price: number | null;        // 현재가. 전환 직후엔 옛 값 유지 → seed 도착 시 교체
  dailyOpen: number | null;    // 등락 기준(티커 openUtc). 캔들 일봉시가 대신 티커에서
  readySymbol: string | null;  // seed가 끝난 종목 — '준비된 종목만 표시' 판정용
}
```

- seed: `fetchHeaderTicker(exchange, symbol, isFutures)` → `last`·`openUtc`. 응답이 현재 종목 것일 때만 커밋(전환 중 늦은 응답 폐기).
- WS: Bitget·Binance는 서버 중계 `subscribeBitget{Futures,Spot}Tickers`·`subscribeBinance{Futures,Spot}Tickers`(`RealtimeTicker.price`), 업비트·빗썸은 `subscribeKrwTickers`. seed 전 틱은 무시(`readySymbol` 가드) — 현행 `loadedKeyRef` 가드와 같은 목적.
- `enabled=false`면 구독 해제·값 유지. Mobile은 이 훅을 쓰지 않는다(현행 차트 종가 유지).
- 테스트(vitest): 구독 함수를 모의해 seed→틱 순서, 전환 중 늦은 seed 폐기, 옛 값 유지 → 교체, KRW 분기.

### Desktop 전환 (d02)

- `DesktopApp`: `useLivePrice` → `useDesktopCandles` → `useOrderbookSnapshot` → `useHeaderSnapshot`. 호가·헤더·탭 타이틀에 `price`·`dailyOpen`·`readySymbol`을 넘긴다.
- `useDesktopCandles`: `priceFromTicker` 제거. 반환에서 `livePrice`·`dailyOpenPrice`·`loadedSymbol` 대신 캔들만(`candles`·`timeframe`·`loadCandles`·`handleVisibleRangeChange`). 차트 소수점 스테이징(`chartDecimalsRef`)은 캔들 배열의 종목(`candlesKey`)을 따라야 하므로 `useCoinCandles`가 `candlesSymbol`을 추가로 반환한다(새 상태 아님, 기존 `candlesKeyRef` 노출).
- `loadedSymbol` 재정의: 헤더·호가는 `readySymbol === symbol`, 차트 소수점·지표는 `candlesSymbol === symbol`. [2026-09-05 정정] 헤더 체감 순서는 바뀌지 않는다 — 헤더는 `allReady`가 24h 티커·일봉 2개·시가총액까지 기다리므로 d02 전과 같이 차트보다 늦게 바뀐다(사용자 관찰로 확인). 분리의 효과는 현재가가 차트 TF·캔들 fetch 실패에 묶이지 않는 것이다.
- 등락 기준이 캔들 일봉시가(`loadCandles('1Dutc', 2)`)에서 티커 `openUtc`로 바뀐다. 거래소마다 UTC 기준이 같으므로 값은 같아야 하며, 다르면 d02 evidence에 기록하고 사용자에게 보고한다.

### useCoinCandles 정리 (d03)

- `priceFromTicker`·`fetchHeaderTicker`·`exchange`(KRW WS 분기는 유지) 중 현재가 seed 관련 코드 제거. `Promise.all`은 캔들 + 일봉 2개로. `livePrice`는 WS 틱·refresh 종가만 반영(Mobile 현행).
- Desktop이 안 쓰는 반환(`livePrice`·`dailyOpenPrice`·`loadedSymbol`)은 Mobile용으로 유지. Mobile `CoinChartPage` 표시가 변경 전과 같은지 사용자 확인.

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. d02 시작 전에 "훅이 받을 것·돌려줄 것" 표와 `loadedSymbol` 재정의를 확정받는다.
- 한 PR에 한 Delivery. d01은 호출부 변경이 없어 동작 불변, d02·d03은 동작 변경이라 양 앱 육안 확인이 merge 조건.
- Gate: `npm test` · `npm run build` · `npm run build:desktop` · `npm run lint`(error 0) · 번들 grep · `npm run check:css` · labs `tsc` · Desktop·Mobile dev 서버 렌더링.
- 제외: Mobile 현재가 소스 변경(차트 종가 유지), 호가 훅 자체 변경, OQ-20260905-01(Binance 24h vs UTC 기준)·OQ-20260905-06.

## Delivery Notes

### wp-08-d01-hook
- 새 파일 `hooks/market/useLivePrice.ts`, `useLivePrice.test.ts`. 기존 파일 변경 없음.

### wp-08-d02-desktop
- 변경: `DesktopApp.tsx`(조립 순서·props), `hooks/useDesktopCandles.ts`(priceFromTicker 제거·반환 축소), `hooks/useOrderbookSnapshot.ts`·`hooks/useHeaderSnapshot.ts`(props 이름 `livePrice`/`loadedSymbol` 유지, 값의 출처만 바뀜), `chart/hooks/useCoinCandles.ts`(`candlesSymbol` 반환 추가).
- 확인: Desktop 로그인 후 거래소 4종·현물/선물 전환.

### wp-08-d03-candles-cleanup
- 변경: `chart/hooks/useCoinCandles.ts`만. Mobile 로그인 후 차트 현재가·등락.
