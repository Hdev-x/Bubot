---
schema: ai-workflow/work-package@1
id: wp-03-web-structure
title: apps/web 폴더 구조 재편 (계층 우선 + 앱별 분리 + CSS 동반)
workstream: refactor
state: active
updated: 2026-09-03
depends_on: [wp-02-beta-boundary]
supersedes: []
outcome: "apps/web/src가 app/{mobile,desktop} · chart · api/{server,exchange} · hooks/{market,account,ui} · shared 구조로 재편되고, CSS는 쓰는 코드 옆에 놓이며, 화면·동작은 재편 전과 동일하다."
acceptance:
  - "AC-001: 목표 트리(docs/architecture/WEB-STRUCTURE-REVIEW.md 4절)와 실제 폴더가 일치하고 src/components·src/web·src/pages·src/utils·src/drawing가 남지 않는다."
  - "AC-002: import 방향이 app → chart/hooks → api → shared로만 향한다 (역방향 grep 0)."
  - "AC-003: 각 Delivery 후 tests 22·build 2종·lint error 0·번들 제외 문자열 0이 유지된다."
  - "AC-004: d03~d05는 Mobile·Desktop 주요 화면의 재편 전후 스크린샷이 동일하다 (레이아웃·색 변화 없음)."
  - "AC-005: 클래스 이름·로직은 바꾸지 않는다. 변경은 파일 위치·import 경로·CSS 파일 분할·client.ts 분리뿐이다."
deliveries:
  - id: wp-03-d00-dead-code
    title: "dead code 8개 파일과 labs 잔여 CSS 구역 삭제"
    kind: git
    state: active
    repository: .
    depends_on: []
    branch: refactor/web-d00-dead-code
    pull_requests: []
    evidence:
      - kind: command
        locator: "8개 파일 삭제(참조 0 확인), styles.css 8개 구역 2,076줄 삭제 — 구역 밖 정의 없는 범용 선택자 0, 삭제 후 파일이 '원본 − 구역'과 바이트 동일; lint 0·tests 22·build 2종·번들 문자열 0. '멀티봇 대시보드' 구역은 자산 화면 클래스 88개 사용 중이라 보존"
        revision: working-tree
        observed_at: 2026-09-03
  - id: wp-03-d01-api
    title: "api/ → client.ts + server/ + exchange/"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d00-dead-code]
    branch: refactor/web-d01-api
    pull_requests: []
    evidence: []
  - id: wp-03-d02-hooks
    title: "hooks/ → market/ · account/ · ui/, 차트 훅은 chart/hooks"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d01-api]
    branch: refactor/web-d02-hooks
    pull_requests: []
    evidence: []
  - id: wp-03-d03-chart
    title: "chart/ 신설 — MarketChart·overlays·indicators·settings·drawing·analysis + 동반 CSS 추출"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d02-hooks]
    branch: refactor/web-d03-chart
    pull_requests: []
    evidence: []
  - id: wp-03-d04-app-mobile
    title: "app/mobile — 진입점·pages·components·sheets, styles.css 구역 분할"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d03-chart]
    branch: refactor/web-d04-app-mobile
    pull_requests: []
    evidence: []
  - id: wp-03-d05-app-desktop
    title: "app/desktop — 진입점·panels, web.css 분할과 복사 구역 제거"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d04-app-mobile]
    branch: refactor/web-d05-app-desktop
    pull_requests: []
    evidence: []
  - id: wp-03-d06-shared
    title: "shared/ 정리(types·constants·contexts·utils·tokens.css), 의존 방향 규칙 문서화"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-03-d05-app-desktop]
    branch: refactor/web-d06-shared
    pull_requests: []
    evidence: []
milestones:
  - id: web-structure-locked
    title: "구조 재편 완료"
    state: pending
    depends_on: [wp-03-d06-shared]
    acceptance:
      - "GATE-AC-001: AC-001~AC-003 자동 검사 통과."
      - "GATE-AC-002: AC-004 스크린샷 대조와 로컬 기동에서 Mobile·Desktop 핵심 화면 동작 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# apps/web 폴더 구조 재편

## 범위

포함:

- 목표 트리(`docs/architecture/WEB-STRUCTURE-REVIEW.md` 4절)대로 파일 이동과 import 경로 수정
- `styles.css`·`web.css`를 구역 주석 단위로 분할해 앱별 `styles/`와 공용 컴포넌트 옆으로 배치, `:root` 변수는 `shared/styles/tokens.css`
- `api/client.ts` 신설(authApi의 토큰 헤더·공통 fetch 분리) — 이 WP에서 유일한 코드 변경
- dead code 8개 파일과 labs로 옮긴 화면의 CSS 구역 삭제

제외:

- 클래스 이름 변경, CSS Modules 도입 (후속)
- 큰 파일 분해(`WebApp.tsx`·`MarketChart.tsx`·`useAutoPatterns.ts`), lint warning baseline 축소 (후속 WP)
- 로직·동작 변경

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. 각 Delivery 시작 전에 이동 목록·import 변경 방식·검증을 설명하고 승인받는다.
- 한 PR에 한 Delivery. `git mv` + 경로 치환, 내용 변경은 import 줄과 CSS 파일 분할뿐임을 diff로 확인한다.
- Gate: `npm test`(22) · `npm run build` · `npm run build:web` · `npm run lint`(error 0) · 번들 grep(`/api/paper|/api/admin|/api/bot|backtest-runs|trade-configs` 0).
  d03~d05는 `docs/images/` 외 임시 경로에 앞뒤 스크린샷을 저장해 대조한다.

## Delivery Notes

### wp-03-d00-dead-code
- 삭제: `components/OrderTicket.tsx`, `components/trade/SpotTicket.tsx`, `components/FloatingToolbar.tsx`, `components/DrawingSettingsSheet.tsx`, `api/walletApi.ts`, `utils/toast.ts`, `pages/PlaceholderPage.tsx`, `config/features.ts`
- `styles.css`에서 Strategy Page·Backtest Panel·LivePage·Live*·PaperStatusPanel 구역 삭제(구역 주석 기준). 삭제 전 해당 클래스가 남은 Beta 코드에서 쓰이는지 grep으로 확인.
- 실행 결과(2026-09-03): 8개 구역 2,076줄 삭제. "통합 대시보드 멀티봇" 구역(1,262줄)은 이름과 달리 `asset-*` 등 자산 화면 클래스 88개가 사용 중이라 보존.
  "서브계정 뱃지" 구역도 `sub-account-badge`가 사용 중이라 보존.

### wp-03-d01-api
- `api/client.ts`: `authApi.ts`의 `getToken`·`authHeader`(및 axios 인스턴스가 있으면 그것)를 옮기고 `authApi`는 로그인·회원·me만 남긴다. 다른 api 파일의 `from './authApi'` 참조를 `./client`로 바꾼다.
- 이동: server/ 6개, exchange/bitget 5개·binance 1개·krw 2개·headerTicker·exchangeRate. `chartPolicy.ts` → `config/`.
- import 경로는 스크립트로 치환하고 `git diff -M`으로 rename·경로 줄만 바뀌었는지 확인.

### wp-03-d02-hooks
- `hooks/market` 6개, `hooks/account` 4개(`useWatchlist` 포함), `hooks/ui` 5개, `chart/hooks` 5개(`useCoinCandles`·`useMtfCandles`·`useCandleLoader`·`useCoinDetailChart`·`useChartTheme`). `components/chart-hooks` 2개는 d03에서 `chart/hooks`로.

### wp-03-d03-chart
- `chart/` 신설 후 `MarketChart`·overlays 4·`chart-hooks` 2·`indicators/`·`ChartSettingsSheet`·`drawing/`·`utils`의 re-export 4 이동.
- `styles.css`·`web.css`에서 차트·지표 시트·차트 설정 시트 구역을 잘라 `MarketChart.css`·`indicators.css`·`ChartSettingsSheet.css`로 만들고 해당 컴포넌트가 import. `web.css`의 복사 구역은 삭제.

### wp-03-d04-app-mobile
- `app/mobile/`로 `main.tsx`·`App.tsx`·`pages/`·Mobile 전용 components·`sheets/`·`coin-list/`·`trade/` 이동.
- `styles.css` 나머지를 구역별 파일로 분할해 `app/mobile/styles/`에, `main.tsx`가 순서대로 import. `:root` 변수는 `shared/styles/tokens.css`로.
- `vite.config.js`의 entry·`index.html` 경로 갱신.

### wp-03-d05-app-desktop
- `app/desktop/`로 `web/*` 이동, `web/components` → `panels/`. `web.css` 분할, 복사 구역 제거. `vite.config.web.js`·`web.html` 경로 갱신.

### wp-03-d06-shared
- `types`·`constants`·`contexts`·`utils`를 `shared/`로, `tokens.css` 확정. `docs/architecture/STRUCTURE.md`·`WEB-STRUCTURE-REVIEW.md` 갱신, 의존 방향 규칙을 `docs/PROJECT.md`에 기록. `chart/analysis` re-export 제거 여부 판단.

## 관련 정본

- `docs/architecture/WEB-STRUCTURE-REVIEW.md` (현재 구조 조사·목표 트리)
- `work-status/DECISIONS.md` D-20260903-09 (구조 확정)
- `docs/COMMANDS.md`

## 운영 메모

- 과정은 commit·PR 본문에 기록한다. 정식 identity는 `refactor/wp-03-web-structure`.
