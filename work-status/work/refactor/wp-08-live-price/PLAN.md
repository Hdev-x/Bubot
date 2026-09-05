---
schema: ai-workflow/work-package@1
id: wp-08-live-price
title: 현재가 구독 분리 — useCoinCandles의 티커 현재가를 useLivePrice로 (T-04f)
workstream: refactor
state: ready
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
    state: planned
    repository: .
    depends_on: []
    branch: refactor/lp-d01-hook
    pull_requests: []
    evidence: []
  - id: wp-08-d02-desktop
    title: "Desktop 전환 — DesktopApp이 useLivePrice로 현재가를 받고 캔들·호가·헤더에 넘김, loadedSymbol 재정의"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-08-d01-hook]
    branch: refactor/lp-d02-desktop
    pull_requests: []
    evidence: []
  - id: wp-08-d03-candles-cleanup
    title: "useCoinCandles 정리 — priceFromTicker·헤더 티커 제거, 현재가는 차트 종가만 (Mobile 확인)"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-08-d02-desktop]
    branch: refactor/lp-d03-candles-cleanup
    pull_requests: []
    evidence: []
milestones:
  - id: live-price-split-done
    title: "현재가 구독 분리 완료"
    state: pending
    depends_on: [wp-08-d03-candles-cleanup]
    acceptance:
      - "GATE-AC-001: AC-001·AC-004·AC-005·AC-006 자동 검사(줄 수, useCoinCandles의 fetchHeaderTicker grep 0, Gate, import 방향 grep)."
      - "GATE-AC-002: 사용자가 Desktop 로그인 후 종목·거래소 전환(Bitget↔Binance↔업비트↔빗썸, 현물↔선물)에서 헤더 현재가·등락·호가 중앙·탭 타이틀이 함께 바뀌고 섞임·깜빡임이 없는 것, Mobile 차트 현재가·등락이 변경 전과 같은 것을 육안 확인."
    unlocks: []
    evidence: []
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
- `loadedSymbol` 재정의: 헤더·호가는 `readySymbol === symbol`, 차트 소수점은 `candlesSymbol === symbol`. 둘을 분리해 "현재가는 왔는데 캔들은 아직"인 상태에서 헤더가 먼저 바뀌는 것을 허용한다(현행은 캔들까지 기다렸다). 사용자 육안 확인 항목.
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
