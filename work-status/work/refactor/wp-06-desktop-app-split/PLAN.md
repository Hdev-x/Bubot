---
schema: ai-workflow/work-package@1
id: wp-06-desktop-app-split
title: DesktopApp.tsx 분해 (1,812줄 → 조립 컴포넌트 + 영역 컴포넌트 + 데이터 훅)
workstream: refactor
state: active
updated: 2026-09-04
depends_on: [wp-05-desktop-naming]
supersedes: []
outcome: "DesktopApp.tsx가 상태를 조립해 영역 컴포넌트에 넘기는 300줄 안팎의 파일이 되고, 화면 8개 영역은 각자 컴포넌트, 데이터 흐름 5개는 각자 훅으로 나뉜다. 동작·화면은 분해 전과 동일하다."
acceptance:
  - "AC-001: DesktopApp.tsx가 400줄 이하이고, 새 파일은 각각 400줄 이하다. 소형 컴포넌트·상수·순수 함수는 DesktopApp.tsx 밖에 있다."
  - "AC-002: 각 Delivery는 동작을 바꾸지 않는다. 상태 변수·effect·핸들러는 위치만 옮기고 내용을 바꾸지 않으며, 새 상태·새 effect를 만들지 않는다 (props 전달을 위한 타입 선언만 추가)."
  - "AC-003: 각 Delivery 후 tests 22·build 2종·lint error 0·번들 제외 문자열 0·labs tsc가 유지되고, Desktop dev 서버가 렌더링된다."
  - "AC-004: 각 Delivery 후 사용자가 로그인 상태에서 해당 영역의 상호작용(버튼·탭·드롭다운)을 육안 확인한다. AI는 비로그인 화면의 computed style 대조만 한다."
  - "AC-005: 영역 컴포넌트는 app/desktop/ 안에 두고, chart/·hooks/·api/를 새로 참조하는 방향은 app → 하위 계층만이다."
deliveries:
  - id: wp-06-d01-helpers
    title: "맨 위 340줄 분리 — 상수·순수 함수 → lib/, 소형 컴포넌트 6개 → panels/ (기계적)"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: refactor/dapp-d01-helpers
    pull_requests: [45]
    evidence:
      - kind: parity-check
        locator: "DesktopApp.tsx 1,812 → 1,529줄. 새 파일 8개 298줄: lib/timeframes(63)·orderbook(20)·format(22)·drawTools(33)·indicatorDefaults(25), panels/ObjectTree(56)·MiniCandles(20)·SidebarBits(59). DesktopApp 변경은 삭제 288줄 + import 8줄, 본문 변경 0. 옮긴 코드는 export 추가·React.ReactNode→ReactNode 외 동일. SECTIONS·INVEST_TABS·CHATS·CHART_FALLBACK 위치: CHART_FALLBACK은 timeframes로, 나머지는 d02까지 잔류"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "tsc ok · lint 0(불필요해진 import 4개 제거 후) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. Desktop dev 서버 렌더링, computed style 대조 325 요소 중 14 diff는 OHLC·호가 게이지·클래스 없는 span(실시간)뿐"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-06-d02-shell
    title: "셸 영역 컴포넌트 — DesktopHeader · IconRail · Sidebar(InvestSection 포함)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-06-d01-helpers]
    branch: refactor/dapp-d02-shell
    pull_requests: [46]
    evidence:
      - kind: parity-check
        locator: "DesktopApp.tsx 1,529 → 1,216줄(삭제 331 + 호출 21줄 + import). 새 파일: panels/DesktopHeader(73, props 8)·IconRail(35, props 4)·Sidebar(59, props 7 + invest 묶음)·InvestSection(272, 묶음 5개: main 9·spot 6·currency 5·view 9·actions 2), lib/sections(10: Section·SECTIONS·INVEST_TABS·InvestTab — IconRail과 Sidebar가 같이 써서 Sidebar 대신 lib로). JSX 본문·핸들러·effect 내용 변경 0, menuRef는 바깥 클릭 effect가 써서 부모 소유 유지"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "tsc ok · lint 0(이동으로 불필요해진 import 6개 제거) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. Desktop 렌더링(header·rail 4버튼·sidebar), computed style 325 요소 중 14 diff는 실시간 값뿐. 비로그인 상호작용: 레일 '실시간' 클릭 → 사이드바 open·제목 '실시간'·MarketPanel 렌더, 접기 버튼 → 닫힘"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-06-d03-hooks
    title: "데이터 훅 — useHeaderSnapshot · useOrderbookSnapshot · useDesktopCandles"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-06-d02-shell]
    branch: refactor/dapp-d03-hooks
    pull_requests: [47]
    evidence:
      - kind: parity-check
        locator: "DesktopApp.tsx 1,216 → 1,035줄(삭제 197 + 훅 호출 16줄). hooks/useDesktopCandles(36)·useOrderbookSnapshot(95)·useHeaderSnapshot(116). 승인 표 그대로, 추가로 funding을 호가 훅 반환값에 넣음(JSX가 OB 없을 때 폴백으로 씀). 상태·effect·의존성 배열 내용 변경 0. 훅 호출 순서는 캔들 → 호가(원래 호가 블록이 앞)로 바뀜 — 두 블록은 독립 구독이라 영향 없음"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "tsc ok · lint 0(불필요 import 14개 제거) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭에서 Desktop 로드: 종목 헤더 H 스냅샷(전날 종가·당일 시가·24h 고저·거래량) 표시, 호가 12행, 제목 현재가 갱신, 콘솔 오류는 로그인 전 ws-coin뿐. computed style 325 요소 중 14 diff는 실시간 값뿐"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-06-d04a-chart-hooks
    title: "차트 상태 훅 — useDrawingState · useIndicatorState · useChartViewState (툴바·무대 props 묶음)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-06-d03-hooks]
    branch: refactor/dapp-d04a-chart-hooks
    pull_requests: [48]
    evidence:
      - kind: parity-check
        locator: "DesktopApp.tsx 1,035 → 1,002줄(삭제 50 + 훅 호출·구조 분해 12줄). hooks/useDrawingState(24)·useIndicatorState(38)·useChartViewState(27). 상태 선언 20개·ref 3개·eff* 5개·isCustomTheme·toggleIndiGroup을 위치만 이동, 초기값·저장 키·본문 변경 0. DesktopApp은 당분간 훅 반환을 전부 구조 분해해 JSX가 기존 이름을 그대로 씀(d04b에서 묶음째 전달). 드롭다운 바깥 클릭 effect·visibleTFs·TF 폴백 effect는 잔류. 훅 호출 위치가 원래 선언 위치(89~113)와 같아 다른 훅과의 순서 변화는 chartTheme·isLogScale·priceLineOn·지표 설정 4개가 앞으로 당겨지는 것뿐"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "tsc ok · lint 0(불필요 import 5줄 정리) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭 Desktop: 렌더링, 툴바 TF 버튼 1H→4H 클릭 시 active 전환, 호가 12행, 콘솔 오류는 로그인 전 ws-coin뿐"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-06-d04b-chart
    title: "차트 영역 컴포넌트 — SymbolHeader · ChartStage · ChartToolbar (묶음 props)"
    kind: git
    state: active
    repository: .
    depends_on: [wp-06-d04a-chart-hooks]
    branch: refactor/dapp-d04b-chart
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "DesktopApp.tsx 1,002 → 539줄(삭제 485 + 묶음 객체 5개·컴포넌트 호출 27줄). panels/SymbolHeader(65, props 6)·ChartToolbar(364, 묶음 6 + 개별 6)·ChartStage(153, 묶음 8 + 개별 6)·chartProps.ts(38, 묶음 타입). JSX 본문·핸들러 변경 0. 표와 다른 점: 툴바에 onLoginClick 추가(지표·설정 버튼이 비로그인 시 호출), 무대 data 묶음에 obOptions 추가, 개별로 잡혔던 trade·section·spot은 className 문자열 오탐이라 제외. d04a의 구조 분해는 바깥 클릭 effect·useMtfCandles·TF 폴백이 쓰는 9개만 남김"
        revision: working-tree
        observed_at: 2026-09-05
      - kind: command
        locator: "tsc ok · lint 0(불필요 import 15줄 정리) · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. 새 탭 Desktop: 종목 헤더(H 스냅샷)·툴바 TF 13개·4H 클릭 전환·OHLC 오버레이·차트 canvas·호가 12행, 콘솔 오류는 로그인 전 ws-coin뿐"
        revision: working-tree
        observed_at: 2026-09-05
  - id: wp-06-d05-middle
    title: "가운데 영역 — OrderbookPanel · RightPanel, 문서 갱신"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-06-d04b-chart]
    branch: refactor/dapp-d05-middle
    pull_requests: []
    evidence: []
milestones:
  - id: desktop-app-split-done
    title: "DesktopApp 분해 완료"
    state: pending
    depends_on: [wp-06-d05-middle]
    acceptance:
      - "GATE-AC-001: AC-001·AC-003·AC-005 자동 검사(줄 수, Gate, import 방향 grep)."
      - "GATE-AC-002: 사용자가 로그인 후 Desktop 전 영역(헤더 검색·메뉴, 사이드바 탭·필터, 툴바 전 버튼, 차트 드로잉, 호가 묶음, 관심창 float/dock)을 육안 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# DesktopApp.tsx 분해

## 범위

포함 (2026-09-04 조사, `main 8141df6`, `apps/web/src/app/desktop/DesktopApp.tsx` 1,812줄):

| 구간 | 줄 | 내용 | 목적지 |
|---|---|---|---|
| 28~366 | 340 | 상수·순수 함수·소형 컴포넌트 6개 | d01 `lib/`·`panels/` |
| 367~882 | 516 | 상태 40개·effect 13개·핸들러 | d03·d04 훅으로 일부, 나머지 `DesktopApp` 잔류 |
| 889~941 | 53 | 헤더 | d02 `DesktopHeader` |
| 957~1002 | 46 | 종목 헤더 | d04 `SymbolHeader` |
| 1008~1328 | 321 | 차트 툴바 | d04 `ChartToolbar` |
| 1329~1427 | 99 | 차트 무대 | d04 `ChartStage` |
| 1430~1466 | 37 | 호가 패널 | d05 `OrderbookPanel` |
| 1467~1520 | 54 | 오른쪽 패널 | d05 `RightPanel` |
| 1522~1770 | 249 | 사이드바 | d02 `Sidebar` + `InvestSection` |
| 1772~1811 | 40 | 아이콘 레일·푸터·플로팅 관심창 | d02 `IconRail`, 나머지 잔류 |

제외:

- 동작·디자인 변경, 상태 구조 변경(예: 여러 useState를 reducer로 합치기), 새 라이브러리
- `MarketChart.tsx`·`useAutoPatterns.ts`·`OrderPage.tsx` 분해 (각각 별도 WP)
- lint warning 축소, `any` 정리 (OQ-11)
- CSS 파일 재배치 — 새 컴포넌트가 생겨도 규칙은 `DesktopApp.css`·`panels.css`에 그대로 두고, 파일 이동은 wp-04 규칙에 따라 후속

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. d02부터는 시작 전에 "이 컴포넌트가 받을 props 목록(상태·핸들러)"을 표로 보여주고 승인받는다. props가 15개를 넘으면 묶음 객체나 훅으로 줄일지 그때 정한다.
- 한 PR에 한 Delivery. 이동한 코드는 `git diff --color-moved`로 "옮겨진 블록"과 "새로 쓴 줄(props 타입·전달)"을 구분해 evidence에 남긴다.
- 컴포넌트 추출 규칙: JSX 블록을 잘라 새 파일의 함수 본문으로 옮기고, 그 블록이 참조하는 상태·핸들러를 props로 받는다. 핸들러는 `DesktopApp`에 두고 함수째 넘긴다(useCallback 추가 안 함). 이름은 영역 이름 그대로.
- 훅 추출 규칙: 한 구역 주석 아래의 state·effect·파생값을 통째로 `useXxx()`로 옮기고, `DesktopApp`은 반환값을 구조 분해해 쓴다. 의존성 배열과 effect 순서는 바꾸지 않는다.
- Gate: `npm test`(22) · `npm run build` · `npm run build:desktop` · `npm run lint`(error 0) · 번들 grep · labs `tsc` · Desktop dev 서버 렌더링 + 비로그인 computed style 대조. 사용자 육안 확인(AC-004)이 merge 조건.

## Delivery Notes

### wp-06-d01-helpers
- `lib/timeframes.ts`(`Tf`·`WEB_TIMEFRAMES`·`TF`·`UNSUPPORTED_TF`·`getIntervalSeconds`·`getBucketTime`), `lib/orderbook.ts`(`depthLabelFor`·`aggregateLevels`), `lib/format.ts`(`fmtAsset`·`logoClass`·`calcRoe`), `lib/drawTools.tsx`(`WEB_DRAW_TOOLS`), `lib/indicatorDefaults.ts`(`INDICATORS_OFF`·`MA_OFF`·`pivotOff`·`DARK_THEME`), 섹션 상수(`SECTIONS`·`INVEST_TABS`·`CHATS`)는 사이드바가 쓰므로 d02까지 잔류 후 `Sidebar`로.
- `panels/ObjectTree.tsx`, `panels/MiniCandles.tsx`, `panels/SidebarBits.tsx`(`SidebarAssetSkeleton`·`HeaderLogo`·`HdSk`·`Chevron` — 20줄 미만이라 한 파일).
- 순수 이동. `DesktopApp.tsx`는 import만 늘어난다.

### wp-06-d02-shell
- `DesktopHeader`(검색·아바타 메뉴: `menuOpen`·`menuRef`·`user`·`onLoginClick`·`onLogout`·검색 핸들러), `IconRail`(`section`·`sidebarOpen`·`watchMode`), `Sidebar`(`section`·`investTab`·`krw`·`walletOpen`·`portfolioOn`·`positionsOn`·`selPosIdx`·자산/포지션 데이터·`bothOn`). 자산 목록 210줄은 `InvestSection`으로 한 번 더 나눈다.
- 시작 전 props 표 확정.

### wp-06-d03-hooks
- `useHeaderSnapshot(symbol, exchange)`: 747~839(`tkr`·`dayStats`·`marketCap`·H 스냅샷). `useOrderbookSnapshot`: 519~688(호가 구독·`depthScale`·OB 스냅샷). `useDesktopCandles`: 579~640.
- 반환값은 기존 변수 이름 그대로.

### wp-06-d04a-chart-hooks (2026-09-04 분할)
- 툴바 52개·무대 48개 참조를 묶기 위해 상태 훅 3개를 먼저 뽑는다: `useDrawingState`(도구·히스토리·선택·설정·자석·드롭다운), `useIndicatorState`(SMC·MA·BB·피벗 설정 + eff* + 그룹 접힘·드롭다운, 입력 `indiOff`), `useChartViewState`(TF·로그축·현재가선·테마·설정 드롭다운, 입력 `loggedIn`).
- `rsi`·`rank`·`solo` 묶음은 객체로 d04b에서 만든다. `visibleTFs`·TF 폴백 effect·바깥 클릭 effect는 DesktopApp 잔류.

### wp-06-d04b-chart
- `SymbolHeader`(props 7), `ChartStage`(묶음 `draw`·`indi`·`view`·`rsi`·`solo` + 캔들·MTF·OHLC·`spot`·포맷터·`chartTickDecimals`), `ChartToolbar`(묶음 6개 + `user`·`isAdmin`·`section`·`webChartRef`·`handleCaptureChart`·`visibleTFs`).
- 시작 전 props 표 확정.

### wp-06-d05-middle
- `OrderbookPanel`(`TradeOrderbook` 래핑 + 묶음 선택), `RightPanel`(마켓/전략 탭). `STRUCTURE.md` 트리 갱신, 잔여 줄 수 확인.
