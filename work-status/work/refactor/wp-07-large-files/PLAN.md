---
schema: ai-workflow/work-package@1
id: wp-07-large-files
title: 큰 파일 분해 나머지 — DrawingToolbar · useAutoPatterns · OrderPage · MarketChart
workstream: refactor
state: active
updated: 2026-09-05
depends_on: [wp-06-desktop-app-split]
supersedes: []
outcome: "641·990·911·1,585줄짜리 파일 4개가 역할 단위 파일로 나뉘어 각 파일이 한 화면에서 읽히고, 새 파일은 400줄 이하다. 동작·화면은 분해 전과 동일하다."
acceptance:
  - "AC-001: 새로 만든 파일은 모두 400줄 이하. 원본은 목표 줄 수(아래 표) 이하로 줄고, 남는 이유가 문서화된다."
  - "AC-002: 동작 불변 — 상태·effect·의존성 배열·계산 로직은 위치만 옮기고 내용을 바꾸지 않는다. 새 상태·effect 0."
  - "AC-003: 각 Delivery 후 tests 22·build 2종·lint error 0·번들 제외 문자열 0·labs tsc가 유지되고, Desktop·Mobile dev 서버가 렌더링된다."
  - "AC-004: 공용 파일(MarketChart·useAutoPatterns)을 건드린 Delivery는 Desktop과 Mobile 양쪽에서 사용자가 육안 확인한다. 앱 전용 파일은 해당 앱만."
  - "AC-005: import 방향은 app → chart/hooks → api → shared, chart 내부는 MarketChart → hooks/overlays/drawing → analysis만."
deliveries:
  - id: wp-07-d01-drawing-toolbar
    title: "DrawingToolbar(641) → ColorPicker · DrawingFloatBar · DrawingSettings 3파일 (Desktop 전용, 기계적)"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: refactor/lf-d01-drawing-toolbar
    pull_requests: [54]
    evidence:
      - kind: parity-check
        locator: "DrawingToolbar.tsx(641) 삭제 → panels/drawing/ColorPicker(133)·DrawingFloatBar(147)·DrawingSettings(373)·types(3). 옛 파일에 없던 줄은 export 추가 5줄·주석 3줄·GetManager 타입 재선언 1줄뿐. ChartStage import 경로 2줄 변경"
        revision: working-tree
        observed_at: 2026-09-05
      - kind: command
        locator: "tsc ok · lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭 Desktop 로드·툴바·차트 렌더링, 콘솔 오류는 로그인 전 ws-coin뿐. 드로잉 선택 시 플로팅바·설정 다이얼로그는 사용자 확인"
        revision: working-tree
        observed_at: 2026-09-05
  - id: wp-07-d02-auto-patterns
    title: "useAutoPatterns(990) → 순수 헬퍼 300줄을 chart/analysis/harmonicShapes.ts로 (공용, 기계적)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-07-d01-drawing-toolbar]
    branch: refactor/lf-d02-auto-patterns
    pull_requests: [55]
    evidence:
      - kind: parity-check
        locator: "useAutoPatterns.ts 990 → 695줄, 새 파일 chart/hooks/harmonicShapes.ts 304줄(순수 함수 8개). 옛 파일에 없던 줄은 export 8·주석 2·import뿐. 위치를 PLAN의 chart/analysis/가 아니라 chart/hooks/로 바꿈 — AutoShape 타입이 overlays에 있어 analysis→overlays 역방향 import가 생기기 때문(AC-005)"
        revision: working-tree
        observed_at: 2026-09-05
      - kind: command
        locator: "tsc ok · lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭 Desktop 차트 렌더링·Mobile 로그인 화면 로드, 콘솔 오류는 로그인 전 ws-coin과 Binance REST 418(거래소 측 rate limit, 무관)뿐. 하모닉 패턴 표시는 관리자 로그인 후 양 앱 사용자 확인"
        revision: working-tree
        observed_at: 2026-09-05
  - id: wp-07-d03-order-page
    title: "OrderPage(911) → PositionsPanel · TradeHistoryDrawer · TradeTabBar 컴포넌트 + 호가 폴링 훅 (Mobile 전용)"
    kind: git
    state: active
    repository: .
    depends_on: [wp-07-d02-auto-patterns]
    branch: refactor/lf-d03-order-page
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "OrderPage.tsx 911 → 417줄(삭제 513 + 호출 19줄). components/trade/TradeTabBar(43, props 6)·PositionsPanel(258, 묶음 trade 8·view 5·actions 4)·TradeHistoryDrawer(189, props 7, fmt·ago·outcomeLabel 동반)·app/mobile/hooks/useMobileOrderbook(118, 입력 10·반환 12, depthLabelFor 동반). 옛 파일에 없던 줄은 props 타입 선언·export·주석뿐. 표와 다른 점: 훅 위치를 hooks/account/가 아니라 app/mobile/hooks/로(Bitget 거래 뷰 전용 로직이라 앱 소유), 현물 보유·원가 수정 줄은 OrderPage 잔류"
        revision: working-tree
        observed_at: 2026-09-05
      - kind: command
        locator: "tsc ok · lint 0(경고 237, 불필요 import 6줄 정리) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭 Mobile 로그인 화면 로드(스타일시트 12). 거래 탭은 로그인 후 사용자 확인. 콘솔의 Binance 418은 거래소 IP 차단(PR #56 참고), 무관"
        revision: working-tree
        observed_at: 2026-09-05
  - id: wp-07-d04-market-chart
    title: "MarketChart(1,585) → RSI 페인·랭킹 선·자석/키보드·값 오버레이 effect를 훅으로 (공용, 양 앱 확인)"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-07-d03-order-page]
    branch: refactor/lf-d04-market-chart
    pull_requests: []
    evidence: []
milestones:
  - id: large-files-split-done
    title: "큰 파일 분해 완료"
    state: pending
    depends_on: [wp-07-d04-market-chart]
    acceptance:
      - "GATE-AC-001: AC-001·AC-003·AC-005 자동 검사(줄 수 표, Gate, import 방향 grep)."
      - "GATE-AC-002: 사용자가 Desktop·Mobile 로그인 후 차트(지표·RSI·드로잉·자석·신뢰선), Mobile 거래 탭(포지션·거래내역·호가 묶음), Desktop 드로잉 설정 다이얼로그를 육안 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# 큰 파일 분해 나머지

## 범위와 목표 줄 수 (2026-09-05 조사, `main 34b895b`)

| 파일 | 현재 | 목표 | 구성 |
|---|---|---|---|
| `app/desktop/panels/DrawingToolbar.tsx` | 641 | 3파일 각 ≤ 350 | 색 유틸·`ColorPicker`·`ColorSwatch`·`LinePreview`(6~134) / `DrawingFloatBar`(149~276) / `DrawingSettings`(294~641) |
| `chart/hooks/useAutoPatterns.ts` | 990 | ≤ 700 | 순수 헬퍼 함수 8개(37~330, 하모닉 색·키·라벨·TP/SL·도형 조립) + 650줄 effect 하나(332~990) |
| `app/mobile/pages/OrderPage.tsx` | 911 | ≤ 450 | 로직 88~364(호가 폴링 255~364 포함), JSX: 탭바(367~395)·심볼 헤더·2열 그리드·포지션 패널(482~694)·거래내역 드로어(696~852)·시트 4개 |
| `chart/MarketChart.tsx` | 1,585 | ≤ 1,100 | effect 30개. 차트 초기화 401줄(677~1077)·데이터 반영 208줄(1154~1361)은 유지. RSI 페인(445~546·1409~1412), 신뢰도 랭킹 선(75~90·1507~1586), 자석·키보드(418~441·654~674), 값 오버레이(1439~1505)를 훅으로 |

useAutoPatterns의 650줄 effect와 MarketChart의 초기화·데이터 effect는 "한 흐름"이라 이번엔 나누지 않는다. 그래서 두 파일의 목표는 400이 아니라 위 표 값이고, 남는 이유는 Milestone evidence에 적는다.

제외:

- 동작·디자인 변경, 상태 구조 변경, `any` 정리(OQ-11), CSS 재배치
- `useCoinCandles`의 `useLivePrice` 분리(T-04f) — 별도
- labs 보존 코드

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. d03·d04는 시작 전에 "컴포넌트/훅이 받을 것·돌려줄 것" 표를 확정받는다. d01·d02는 파일 단위 이동이라 표 없이 시작하되 결과를 PR에서 확인받는다.
- 한 PR에 한 Delivery. `git diff --color-moved`로 이동 블록과 새로 쓴 줄(타입·호출)을 구분해 evidence에 남긴다.
- 컴포넌트·훅 추출 규칙은 wp-06과 같다. 핸들러는 원래 자리에 두고 함수째 넘기고, effect는 의존성 배열을 바꾸지 않는다.
- Gate: `npm test`(22) · `npm run build` · `npm run build:desktop` · `npm run lint`(error 0) · 번들 grep · labs `tsc` · Desktop·Mobile dev 서버 렌더링 + 비로그인 computed style 대조. 공용 파일은 양 앱 육안 확인이 merge 조건.
- 순서는 위험이 낮은 것부터: Desktop 전용(d01) → 공용이지만 순수 함수(d02) → Mobile 전용(d03) → 공용 컴포넌트 effect(d04).

## Delivery Notes

### wp-07-d01-drawing-toolbar
- `panels/drawing/ColorPicker.tsx`(색 유틸 + `ColorPicker`·`ColorSwatch`·`LinePreview`·`PALETTE`), `panels/drawing/DrawingFloatBar.tsx`, `panels/drawing/DrawingSettings.tsx`. `ChartStage`의 import 경로만 바뀐다.

### wp-07-d02-auto-patterns
- 37~330의 순수 함수(`getHarmonicPatternColor`·`normalizeHarmonicPatternName`·`harmonicPatternKey`·`focusHarmonicPatternKey`·`buildHarmonicLabelStack`·`buildHarmonicTpSlLines`·`buildCompletedEmergingShapes`·`buildTrackerFocusShapes`)를 `chart/hooks/harmonicShapes.ts`로(실행 시 변경: `AutoShape` 타입이 overlays에 있어 analysis/에 두면 역방향 import). React·차트 인스턴스에 의존하지 않는 것만 옮기고, effect 본문은 그대로.

### wp-07-d03-order-page
- 컴포넌트: `components/trade/PositionsPanel.tsx`(482~694), `TradeHistoryDrawer.tsx`(696~852), `TradeTabBar.tsx`(367~395). 훅: `app/mobile/hooks/useMobileOrderbook.ts`(255~364 호가 폴링·원자 커밋; 실행 시 hooks/account/ 대신 앱 폴더로 — Bitget 거래 뷰 전용).
- Mobile 로그인 후 거래 탭·포지션·거래내역·호가 묶음 확인.

### wp-07-d04-market-chart
- 훅: `chart/hooks/useRsiPane.ts`, `useRankLines.ts`, `useDrawingMagnet.ts`(자석 + Delete/Escape 키), `useValueOverlay.ts`. 각 훅은 차트·시리즈 ref와 설정 props를 받고 effect를 그대로 옮긴다.
- 차트 초기화(401줄)·데이터 반영(208줄) effect는 유지. Desktop·Mobile 양쪽 확인.
