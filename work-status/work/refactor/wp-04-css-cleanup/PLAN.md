---
schema: ai-workflow/work-package@1
id: wp-04-css-cleanup
title: apps/web CSS 정리 (미사용 규칙 삭제 + 컴포넌트별 분리)
workstream: refactor
state: active
updated: 2026-09-03
depends_on: [wp-03-web-structure]
supersedes: []
outcome: "mobile.css(6,388줄)·desktop.css(2,360줄)가 앱 셸·토큰만 남는 얇은 파일이 되고, 나머지 규칙은 쓰는 컴포넌트 옆 CSS 파일로 옮겨지며, 어느 곳에서도 안 쓰는 규칙은 사라진다. 화면은 정리 전과 동일하다."
acceptance:
  - "AC-001: 각 CSS 규칙은 그 클래스를 쓰는 컴포넌트 폴더(또는 앱 styles/)에 있고, 두 앱 파일에 같은 선택자가 중복 정의되지 않는다."
  - "AC-002: apps/web·labs 어디서도 참조하지 않는 클래스의 규칙이 0이다 (정적 grep + 동적 클래스명 수동 확인)."
  - "AC-003: 각 Delivery 후 tests 22·build 2종·lint error 0·번들 제외 문자열 0이 유지된다."
  - "AC-004: 각 Delivery 전후 주요 화면의 computed style 스냅샷이 같다 (cascade 순서 변화로 인한 스타일 변경 0)."
  - "AC-005: 클래스 이름·마크업·로직은 바꾸지 않는다. 변경은 CSS 규칙의 위치·삭제와 CSS import 줄뿐이다."
deliveries:
  - id: wp-04-d00-survey
    title: "CSS 구역 지도·미사용 후보·labs 전용·중복 선택자 조사 (문서만)"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: docs/css-d00-survey
    pull_requests: [33]
    evidence:
      - kind: document
        locator: "docs/architecture/WEB-CSS-REVIEW.md — 요약, owner 폴더별 구역 지도, 중복 선택자 172(본문 동일 105·상이 67), 미사용 후보 mobile 129+동적의심 2 / desktop 51+3, labs 전용 46/66, :root 토큰 차이표, 착수 순서"
        revision: working-tree
        observed_at: 2026-09-03
  - id: wp-04-d01-unused
    title: "미사용 규칙 삭제, labs 전용 규칙 처리 (Mobile·Desktop)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-04-d00-survey]
    branch: refactor/css-d01-unused
    pull_requests: [34]
    evidence:
      - kind: command
        locator: "규칙 단위 처리(선택자 목록은 편집하지 않음). mobile 1,004 → 763 (삭제 177·labs 이동 64, 6,389 → 4,757줄), desktop 713 → 564 (삭제 65·labs 이동 84, 2,361 → 1,956줄). 남은 파일에 새 줄 0(HEAD에 없던 줄 없음), 사용 중 클래스 제거 0, 중괄호 균형"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. computed style 대조: Mobile 로그인 화면 55 요소 해시 동일(diff 0). Desktop 325 요소 중 23 diff — 전부 실시간 값(sh-chg 등락 부호, OHLC 오버레이, 호가 게이지, 클래스 없는 span/a/svg)이며 삭제·이동된 클래스를 가진 요소 0. 삭제 전 3초 간격 재측정에서도 11 요소가 달라지는 잡음 수준"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-04-d02-chart
    title: "chart/ 공용 CSS 분리 — MarketChart·overlays·indicators (OQ-12 결정 반영)"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-04-d01-unused]
    branch: refactor/css-d02-chart
    pull_requests: [35]
    evidence:
      - kind: parity-check
        locator: "지표 시트 규칙 중 두 앱에 본문까지 같고 파일당 1회·@media 밖인 21개를 chart/indicators/indicators.css(148줄)로 이동, IndicatorSheet.tsx가 import. mobile 788→767, desktop 571→550 규칙, 남은 파일에 새 줄 0. Mobile 전용 interval-sheet* 7개는 d03으로. MarketChart.css는 필요 규칙이 앱마다 달라(drawing-delete-float 위치, chart-host Mobile 전용) 만들지 않음"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. computed style 대조: Mobile 55 요소 동일(diff 0), Desktop 325 중 12 diff는 호가 게이지(실시간)뿐, indicators.css 로드 확인. 첫 빌드는 주석 안의 'app/*/'가 주석을 조기 종료해 실패 → 문구 수정"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-04-d03-mobile
    title: "Mobile 컴포넌트별 CSS 분리 — pages·trade·coin-list·sheets, mobile.css는 셸·토큰만"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-04-d02-chart]
    branch: refactor/css-d03-mobile
    pull_requests: [36]
    evidence:
      - kind: parity-check
        locator: "767 규칙 → mobile.css 338 + 8개 파일 429 (coin-list 97·trade 90·AssetsPage 54·OrderPage 49·sheets 45·components 43·CoinChartPage 42·CoinListPage 9), 합계 767 보존, 새 줄 0. 목적지는 '클래스를 쓰는 컴포넌트 폴더'로 결정, 여러 폴더가 쓰는 규칙·요소 선택자·LoginPage(WebLogin과 공유)는 셸 잔류"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "정적 안전 검사: 같은 선택자가 다른 파일로 갈리는 경우 0, 같은 특이도·같은 속성·겹치는 rightmost 클래스 쌍이 순서 뒤집히는 경우 0. Desktop이 import하는 TradeOrderbook·StrategyComingSoon 클래스 중 desktop.css에 동일 규칙이 없는 10개는 Desktop 변화 방지를 위해 셸에 보류(d04에서 정리)"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. computed style 대조: Mobile 55 요소 동일(diff 0, 스타일시트 12개 로드), Desktop 325 중 14 diff는 OHLC·호가 게이지·클래스 없는 span(실시간)뿐, trade.css가 Desktop에도 로드됨을 확인"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-04-d04-desktop
    title: "Desktop 컴포넌트별 CSS 분리 — panels·WebApp 셸·로그인, desktop.css는 셸·토큰만"
    kind: git
    state: active
    repository: .
    depends_on: [wp-04-d03-mobile]
    branch: refactor/css-d04-desktop
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "550 규칙 → desktop.css 156 + WebApp.css 195 + panels/panels.css 174 + WebLogin.css 2 = 527, 삭제 23은 trade.css·components.css(Desktop이 이미 로드)에 동일 규칙이 있는 복사본. 새 줄 0. 범용 상태 클래스(사용 파일 6개 이상)는 소유자 판정에서 제외"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "정적 안전 검사: 같은 선택자 분리 0, 순서 뒤집힘 후보 1(속성 선택자 오탐, 셸 잔류로 처리). lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. computed style 대조: Desktop 325 중 12 diff는 호가 게이지(실시간)뿐(스타일시트 9개), Mobile 55 요소 해시 기준선과 동일"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-04-d05-tokens
    title: ":root 토큰 비교 후 공통 토큰 처리 (사용자 결정 후 진행, 생략 가능)"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-04-d04-desktop]
    branch: refactor/css-d05-tokens
    pull_requests: []
    evidence: []
milestones:
  - id: css-clean
    title: "CSS 정리 완료"
    state: pending
    depends_on: [wp-04-d04-desktop]
    acceptance:
      - "GATE-AC-001: AC-001~AC-004 자동 검사 통과 (중복 선택자 0, 미참조 클래스 0, Gate, computed style 대조)."
      - "GATE-AC-002: 사용자가 로컬 기동에서 로그인 후 Mobile·Desktop 핵심 화면(마켓·차트·거래·자산, Desktop 사이드바·패널)을 육안 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# apps/web CSS 정리

## 범위

포함:

- 미사용 규칙 삭제. 정적 조사 기준 후보는 Mobile 164 / Desktop 119 클래스(2026-09-03, 전체 615 / 485). 이 중 labs 보존 코드만 쓰는 클래스 43 / 66은 d00에서 목록화하고 d01에서 사용자 결정(삭제 또는 labs로 이동).
- 컴포넌트별 분리. 규칙을 그 클래스를 쓰는 컴포넌트 옆 `.css`로 옮기고 컴포넌트가 import한다. 앱 `styles/`에는 `:root` 토큰·reset·앱 셸(레이아웃 뼈대)만 남긴다.
- 두 앱 파일에 같은 선택자가 있으면 한 곳(공용 컴포넌트 옆)으로 모은다. 지표 시트·OHLC 오버레이의 33% 상이 복사본은 OQ-20260903-12 결정에 따른다.

제외:

- 클래스 이름 변경, CSS Modules·접두어 도입, 디자인 변경, 마크업 변경 (후속)
- `mobile.css`·`desktop.css` 안의 값 자체를 고치는 일 (색·간격 튜닝은 디자인 작업)
- 큰 파일 분해, lint warning baseline 축소 (별도 WP)

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. 각 Delivery 시작 전에 대상 구역·옮길 곳·삭제 목록·검증을 설명하고 승인받는다. 삭제 목록은 사용자가 훑어볼 수 있게 클래스 이름과 줄 수로 제시한다.
- 한 PR에 한 Delivery. diff는 CSS 규칙 블록의 이동·삭제와 `.tsx`의 `import './X.css'` 줄뿐임을 확인한다.
- 미사용 판정 규칙: (1) `apps/web/src`·`labs/trading/web/src`에서 클래스 문자열이 한 번도 안 나오고, (2) 템플릿 문자열·접두어 조합(`` `asset-${kind}` `` 같은 동적 클래스)으로 만들어지지 않는지 접두어 grep으로 확인한 것만 미사용으로 본다. 확실치 않으면 남긴다.
- cascade 주의: 한 파일이 여러 파일로 갈라지면 같은 특이도의 규칙 적용 순서가 import 순서로 바뀐다. 그래서 각 Delivery는 분할 전후에 주요 화면의 computed style 스냅샷(대표 요소의 `getComputedStyle` 값)을 저장해 대조한다(AC-004). 스냅샷은 Git 밖 임시 경로에 둔다.
- Gate: `npm test`(22) · `npm run build` · `npm run build:web` · `npm run lint`(error 0) · 번들 grep(`/api/paper|/api/admin|/api/bot|backtest-runs|trade-configs` 0) · 규칙 수 대조(분할 후 합계 = 분할 전 − 삭제분) · computed style 대조.

## Delivery Notes

### wp-04-d00-survey
- 산출물 `docs/architecture/WEB-CSS-REVIEW.md`: 구역 주석 기준 구역 지도(구역 → 쓰는 컴포넌트·줄 수), 미사용 후보 목록(정적·동적 확인 결과 구분), labs 전용 클래스 목록, Mobile·Desktop 중복 선택자 목록, `:root` 토큰 차이표.
- 현재 상태(2026-09-03): CSS import는 3곳뿐 — `app/mobile/main.tsx → styles/mobile.css`, `app/desktop/main.tsx → styles/desktop.css`, `chart/settings/ChartSettingsSheet.tsx → ChartSettingsSheet.css`(126줄, wp-03 d03의 첫 분리 사례). `mobile.css`의 구역 주석은 내용과 어긋난 곳이 있어(wp-03 d04 노트) 주석이 아니라 클래스 사용처로 구역을 다시 잡는다.
- 코드 변경 없음. 이 문서가 d01~d04의 삭제·이동 목록 정본이 된다.

### wp-04-d01-unused
- d00 목록 중 "확실히 미사용"만 삭제. labs 전용 규칙은 사용자 결정: (a) 삭제 — labs는 진입점 없이 타입체크만 하므로 CSS가 없어도 깨지지 않음, (b) `labs/trading/web/src/styles/`로 이동 — 나중에 복원할 때 대비. 추천은 (a). labs를 다시 살릴 때 Git 이력에서 꺼낼 수 있다.
- 삭제 후 규칙 수·computed style 대조.

### wp-04-d02-chart
- `chart/MarketChart.css`(차트 컨테이너·툴바·오버레이), `chart/indicators/indicators.css`(지표 시트). OQ-12: Mobile·Desktop 복사본이 33% 다르므로 (a) 공통부 + 앱별 override 파일, (b) 앱별 그대로 두고 chart 폴더로 안 옮김 중 결정 후 진행.
- overlays 4개·drawing 도구가 쓰는 규칙도 이 Delivery에서 chart 옆으로.

### wp-04-d03-mobile
- `pages/*.css`(CoinListPage·CoinChartPage·OrderPage·AssetsPage·LoginPage), `components/trade/trade.css`, `components/coin-list/coin-list.css`, `components/sheets/sheets.css`, 소형 컴포넌트는 폴더 단위 파일 하나. 파일 1개당 규칙이 20줄 미만이면 폴더 파일에 합친다.
- `mobile.css`에 남기는 것: `:root`, reset, `.app`·탭바 셸, 안전영역, 페이지 전환 애니메이션.

### wp-04-d04-desktop
- `panels/*.css` 또는 `panels/panels.css`, `WebApp.css`(헤더·사이드바·레일·본문 그리드), `WebLogin.css`(로그인·가입 공용). `desktop.css`에 남기는 것: `:root`, reset, 앱 셸·푸터.

### wp-04-d05-tokens
- d00의 `:root` 차이표를 보고 결정: 값이 같은 토큰만 `shared/styles/tokens.css`로 올릴지, 앱별 유지할지. wp-03에서 "두 앱 값이 다르다"고 확인했으므로 생략될 수 있다.
