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
    state: planned
    repository: .
    depends_on: []
    branch: refactor/dapp-d01-helpers
    pull_requests: []
    evidence: []
  - id: wp-06-d02-shell
    title: "셸 영역 컴포넌트 — DesktopHeader · IconRail · Sidebar(InvestSection 포함)"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-06-d01-helpers]
    branch: refactor/dapp-d02-shell
    pull_requests: []
    evidence: []
  - id: wp-06-d03-hooks
    title: "데이터 훅 — useHeaderSnapshot · useOrderbookSnapshot · useDesktopCandles"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-06-d02-shell]
    branch: refactor/dapp-d03-hooks
    pull_requests: []
    evidence: []
  - id: wp-06-d04-chart
    title: "차트 영역 — ChartToolbar · ChartStage · SymbolHeader, 드로잉 상태 훅"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-06-d03-hooks]
    branch: refactor/dapp-d04-chart
    pull_requests: []
    evidence: []
  - id: wp-06-d05-middle
    title: "가운데 영역 — OrderbookPanel · RightPanel, 문서 갱신"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-06-d04-chart]
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

### wp-06-d04-chart
- `ChartToolbar`(321줄, 가장 큰 항목): 타임프레임·지표·드로잉·RSI·설정 버튼과 드롭다운. 드로잉 상태(`drawTool`·`drawHistory`·`selDrawId`·`drawSettingsOpen`·`magnetOn`)는 `useDrawingState` 훅으로 먼저 묶어 props 수를 줄인다.
- `ChartStage`(MarketChart + 오버레이 + 플로트바), `SymbolHeader`(H 스냅샷 표시).

### wp-06-d05-middle
- `OrderbookPanel`(`TradeOrderbook` 래핑 + 묶음 선택), `RightPanel`(마켓/전략 탭). `STRUCTURE.md` 트리 갱신, 잔여 줄 수 확인.
