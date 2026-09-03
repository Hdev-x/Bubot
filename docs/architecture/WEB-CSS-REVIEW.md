# apps/web CSS 조사 (wp-04 d00, 2026-09-03)

> `wp-04-css-cleanup` d01~d04의 삭제·이동 목록 정본. 수치는 `main 159e91f` 기준 정적 분석(CSS 파서 + `apps/web/src`·`labs/trading/web/src` grep) 결과다. 코드 변경 없음.
> 판정 규칙은 PLAN "진행 방식"을 따른다. 미사용은 "정적으로 안 나오고 동적 접두어 조합도 아닌 것"만이다.

## 1. 요약

| 파일 | 줄 | 규칙 | 클래스 | 미사용 클래스 | labs 전용 클래스 | `:root` 토큰 |
|---|---|---|---|---|---|---|
| `app/mobile/styles/mobile.css` | 6,389 | 1,016 | 613 | 131 | 46 | 11 |
| `app/desktop/styles/desktop.css` | 2,361 | 716 | 485 | 54 | 66 | 16 |
| `chart/settings/ChartSettingsSheet.css` | 126 | — | — | — | — | — |

- 두 파일에 같은 선택자가 172개 있다. 그중 본문까지 같은 것 105개, 본문이 다른 것 67개(3절).
- CSS import는 3곳뿐이다: `app/mobile/main.tsx`, `app/desktop/main.tsx`, `chart/settings/ChartSettingsSheet.tsx`.
- Desktop은 Mobile의 `components/trade`(주문 티켓·호가) 컴포넌트를 그대로 쓰고, 그 클래스 규칙이 `desktop.css`에도 복사돼 있다(2절 owner 표의 `app/mobile/components/trade`). 이것이 중복 선택자의 큰 부분이다.

## 2. 구역 지도 — 규칙을 쓰는 폴더 기준

구역 주석이 아니라 "그 클래스를 import하는 컴포넌트가 어느 폴더에 있는가"로 묶었다. 여러 폴더가 함께 쓰면 공통 상위 폴더로 올라간다. `app`은 Mobile·Desktop 양쪽이 쓰는 규칙이다.

### mobile.css

| owner 폴더 | 규칙 | 줄 | d01~d04 처리 |
|---|---|---|---|
| `(미참조)` | 183 | 1193 | d01 삭제 후보(4절) |
| `app/mobile/pages` | 155 | 995 | d03 Mobile 분리 |
| `app/mobile/components` | 83 | 634 | d03 Mobile 분리 |
| `app/mobile/components/coin-list` | 97 | 623 | d03 Mobile 분리 |
| `app/mobile/components/trade` | 100 | 622 | d03 Mobile 분리 |
| `(여러 폴더 공용)` | 151 | 592 | d03/d04에서 공통 상위로 |
| `(labs 전용)` | 69 | 425 | d01 사용자 결정(5절) |
| `app` | 74 | 421 | 양 앱 공용 → 공통 컴포넌트 옆 또는 shared |
| `app/mobile/components/sheets` | 45 | 306 | d03 Mobile 분리 |
| `chart/indicators` | 14 | 85 | d02 chart/indicators (OQ-12) |
| `(element/global selector)` | 32 | 82 | 앱 styles/에 남김(reset·셸) |
| `app/mobile` | 9 | 65 | d03 Mobile 분리 |
| `chart` | 3 | 24 | d02 chart/ |
| `app/desktop` | 1 | 1 | d04 Desktop 분리 |

### desktop.css

| owner 폴더 | 규칙 | 줄 | d01~d04 처리 |
|---|---|---|---|
| `app/desktop` | 178 | 733 | d04 Desktop 분리 |
| `app/desktop/panels` | 159 | 307 | d04 Desktop 분리 |
| `(미참조)` | 66 | 277 | d01 삭제 후보(4절) |
| `(여러 폴더 공용)` | 107 | 249 | d03/d04에서 공통 상위로 |
| `app` | 61 | 248 | 양 앱 공용 → 공통 컴포넌트 옆 또는 shared |
| `app/mobile/components/trade` | 34 | 135 | Mobile trade 컴포넌트 규칙의 복사본 → d03에서 한 곳으로(3절) |
| `(labs 전용)` | 84 | 97 | d01 사용자 결정(5절) |
| `chart/indicators` | 14 | 85 | d02 chart/indicators (OQ-12) |
| `(element/global selector)` | 11 | 41 | 앱 styles/에 남김(reset·셸) |
| `chart` | 2 | 9 | d02 chart/ |

## 3. Mobile·Desktop 중복 선택자

- 본문까지 같은 선택자 105개: 한 곳(쓰는 컴포넌트 옆)에만 두면 된다. 대부분 `components/trade`(주문 티켓·호가·체크박스)와 `.up/.down` 류다.
- 본문이 다른 선택자 67개: 앱별 override가 필요하거나 실제로 의도된 차이다. 분리할 때 그대로 두면 import 순서에 따라 승자가 바뀔 수 있어 **d03·d04에서 computed style 대조가 필수**인 지점이다.

<details><summary>본문이 다른 선택자 목록</summary>

```text
.balance-line .value
.balance-lines
.bbo-button
.book-row
.chart-overlay-ohlc
.col-qty
.counterparty-row
.counterparty-select
.currency-selector
.current-price-val
.custom-checkbox:checked::after
.down
.drawing-delete-float
.funding-rate-countdown
.gauge-red, .gauge-green
.long-button
.long-button, .short-button
.market-price-val
.ob-depth-check
.ohlc-change-row
.ohlc-values-row
.ohlc-values-row em
.open-close-toggle button
.open-close-toggle button.active
.orderbook
.orderbook-footer
.pc-action
.pct-btn
.percent-row
.pill-btn
.poscard-actions
.ratio-buy
.ratio-sell
.short-button
.tas-cur
.tas-divider
.tas-hero
.tas-hero-approx
.tas-hero-row
.tas-hero-val
.tas-mkt-amount
.tas-mkt-badge.dir.long
.tas-mkt-badge.dir.short
.tas-mkt-badge.lev
.tas-mkt-badges
.tas-mkt-logo
.tas-mkt-pnlval
.tas-mkt-roe
.tas-mkt-roe-spot
.tas-mkt-roe.down
.tas-mkt-roe.up
.tas-mkt-row
.tas-mkt-sym
.tas-notice
.tas-wallet-approx
.tas-wallet-toggle
.tas-wallet-toggle svg
.tas-wallet-v
.tas-wallet-v.down
.tas-wallet-v.up
.trade-input-wrapper
.trade-select
.up
.val-input
body
from
to
```
</details>

<details><summary>본문이 같은 선택자 목록</summary>

```text
*
.arrow-down
.arrow-next
.balance-line
.balance-line .label
.bar-buy
.bar-sell
.bk-skel-price
.bk-skel-price, .bk-skel-qty
.bk-skel-qty
.book-ratio
.book-row span, .book-row strong
.book-row-skel
.book-side
.checkbox-text
.counterparty-select span:first-child
.current-price-val.down
.current-price-val.flat
.current-price-val.up
.custom-checkbox
.custom-checkbox:checked
.funding-value
.futures-ticket
.gauge-green
.gauge-red
.harmonic-col-title
.harmonic-sec-title
.harmonic-seg-button
.harmonic-seg-button.active
.harmonic-seg-button:first-child
.harmonic-seg-button:hover:not(.active)
.harmonic-seg-grid
.indicator-group
.indicator-group-content
.indicator-group-header
.indicator-group-header svg
.indicator-group-header:hover
.indicator-group-header:hover svg
.indicator-group-label
.indicator-group:hover
.info-circle
.input-label
.interval-button
.interval-button.active
.interval-grid
.interval-section
.interval-section-title
.interval-section-title-row
.interval-section-title-row .interval-section-title
.interval-section:first-child
.interval-section:last-child
.long-button span, .short-button span
.long-button strong, .short-button strong
.long-button:hover, .short-button:hover
.mark-price
.ob-decimals-btn
.ob-filter-btn
.ob-settings-row .interval-button
.ob-settings-row .interval-grid
.ohlc-change-row.down
.ohlc-change-row.up
.open-close-toggle
.orderbook-head
.pc-action:active
.pct-btn:hover
.pill-btn.active
.pill-btn.shrink-s
.price-arrow-row
.price-green
.price-red
.qty-val
.ratio-bar
.single-line
.skeleton-shimmer
.smc-advanced-toggle
.smc-advanced-toggle:hover
.tas-cur-ico
.tas-hero-approx-skeleton
.tas-hero-label
.tas-hero-skeleton
.tas-hero-val--compact
.tas-mkt-badge
.tas-mkt-roe-spot.down
.tas-mkt-roe-spot.na
.tas-mkt-roe-spot.up
.tas-mkt-skel
.tas-mkt-skel .sk-amt
.tas-mkt-skel .sk-bar
.tas-mkt-skel .sk-roe
.tas-mkt-skel .sk-sym
.tas-mkt-skel .tas-mkt-logo
.tas-pos-title
.tas-wallet-col
.tas-wallet-detail
.tas-wallet-k
.tas-wallet-toggle.open svg
.tas-wallet-wrap
.tas-wallet-wrap.open
.toss-switch
.toss-switch-thumb
.toss-switch.active
.toss-switch.active .toss-switch-thumb
.trade-checkbox-label
.trade-pills
.val-input::placeholder
```
</details>

## 4. 미사용 클래스 (d01 삭제 후보)

`apps/web/src`와 `labs/trading/web/src` 어디에도 문자열이 없는 클래스. "동적 의심"은 접두어가 템플릿 문자열(`prefix-${…}`)로 조립되는 흔적이 있어 삭제 전에 사람이 확인해야 하는 것이다. 규칙 수·줄 수는 그 클래스가 등장하는 규칙 기준이라 다른 클래스와 겹칠 수 있다.

### mobile.css — 129개 확실, 2개 동적 의심

동적 의심: `coin-banner`(접두어 `coin-`), `bot-badge`(접두어 `bot-`)

| 클래스 | 규칙 | 줄 |
|---|---|---|
| `counterparty-select` | 3 | 47 |
| `stock-strip` | 8 | 44 |
| `asset-actions` | 6 | 43 |
| `upgrade-card` | 4 | 39 |
| `convert-card` | 4 | 38 |
| `hero-quote` | 6 | 33 |
| `side-toggle` | 6 | 30 |
| `app-header` | 5 | 29 |
| `action-icon-box` | 4 | 28 |
| `range-tabs` | 5 | 27 |
| `asset-info-block` | 5 | 25 |
| `protection-content` | 4 | 25 |
| `ob-settings-btn` | 3 | 23 |
| `chart-drawer-trigger` | 2 | 23 |
| `tv-category-tabs` | 3 | 22 |
| `subaccount-card` | 3 | 21 |
| `drawing-grid-item` | 3 | 20 |
| `symbol-chip` | 3 | 20 |
| `live-error-banner` | 2 | 20 |
| `subaccount-card-config` | 4 | 19 |
| `market-asset-balance` | 3 | 18 |
| `drawing-panel-sheet` | 2 | 18 |
| `chart-slide-sheet` | 2 | 18 |
| `mobile-shell` | 2 | 17 |
| `drawing-panel-pointer` | 2 | 17 |
| `drawing-category-tab` | 2 | 17 |
| `panel-header` | 3 | 16 |
| `ohlc-info-bar` | 3 | 16 |
| `price-block` | 3 | 15 |
| `drawing-panel-clear` | 2 | 15 |
| `empty-state` | 3 | 15 |
| `primary-action` | 3 | 14 |
| `ob-settings-row` | 3 | 14 |
| `add-funds-btn` | 1 | 14 |
| `pc-action` | 2 | 14 |
| `badge` | 3 | 14 |
| `live-dot` | 3 | 13 |
| `watchlist-header` | 2 | 13 |
| `chart-panel` | 2 | 12 |
| `market-cur-toggle` | 1 | 12 |
| `sheet-title-row` | 2 | 12 |
| `subaccount-card-status-dot` | 3 | 12 |
| `subaccount-card-balance` | 2 | 12 |
| `market-asset-label` | 2 | 11 |
| `trade-notice` | 1 | 11 |
| `close-all-btn` | 1 | 11 |
| `live-pos-item` | 3 | 11 |
| `live-ob-chips` | 2 | 11 |
| `asset-actions-container` | 2 | 11 |
| `protection-icon-shield` | 1 | 11 |
| `protection-icon-reserves` | 1 | 11 |
| `order-summary` | 2 | 10 |
| `botz-brand-text` | 1 | 10 |
| `drawing-category-tabs` | 2 | 10 |
| `drawing-tool-grid` | 2 | 10 |
| `tab-indicator` | 1 | 10 |
| `market-menu-btn` | 1 | 10 |
| `history-tab-btn` | 1 | 10 |
| `filter-funnel-btn` | 1 | 9 |
| `sheet-header` | 1 | 9 |
| `live-subaccounts-grid` | 2 | 9 |
| `empty-asset-tab` | 3 | 9 |
| `protection-card` | 1 | 9 |
| `asset-balance-skeleton` | 2 | 8 |
| `market-asset-skeleton` | 2 | 8 |
| `asset-approx-skeleton` | 1 | 8 |
| `market-approx-skeleton` | 1 | 8 |
| `drawing-panel-top` | 1 | 8 |
| `fixed-meta-dot` | 1 | 8 |
| `fixed-market-label` | 1 | 8 |
| `notice-content` | 1 | 8 |
| `poscard-chart` | 1 | 8 |
| `sheet-handle-bar` | 1 | 8 |
| `sheet-close-btn` | 1 | 8 |
| `live-spinner` | 1 | 8 |
| `live-card` | 1 | 8 |
| `live-pos-symbol` | 1 | 8 |
| `live-pos-dir` | 1 | 8 |
| `live-trade-dir` | 1 | 8 |
| `live-unrealized` | 1 | 8 |
| `expanded-chart-area` | 1 | 8 |
| `more-link` | 1 | 8 |
| `notice-close` | 1 | 7 |
| `live-header-right` | 1 | 7 |
| `live-balance` | 1 | 7 |
| `today-pnl` | 3 | 7 |
| `asset-sparkline` | 1 | 7 |
| `action-btn-item` | 1 | 7 |
| `action-label` | 1 | 7 |
| `detail-chart-controls` | 1 | 6 |
| `drawing-panel-backdrop` | 1 | 6 |
| `ob-settings-panel` | 1 | 6 |
| `ob-settings-label` | 1 | 6 |
| `live-unrealized-lev` | 1 | 6 |
| `live-trade-time` | 1 | 6 |
| `live-footer` | 1 | 6 |
| `three` | 2 | 6 |
| `eyebrow` | 1 | 5 |
| `trade-symbol-sort-row` | 1 | 5 |
| `symbol-chip-grid` | 1 | 5 |
| `info-circle` | 1 | 5 |
| `counterparty-row` | 1 | 5 |
| `tools-right` | 1 | 5 |
| `trigger-text` | 1 | 5 |
| `sheet-content` | 1 | 5 |
| `live-card-sub` | 1 | 5 |
| `live-pos-grid` | 1 | 5 |
| `live-trade-left` | 1 | 5 |
| `subaccount-card-header` | 1 | 5 |
| `trade-page--bot` | 1 | 4 |
| `poscard-actions` | 1 | 4 |
| `trigger-arrow` | 1 | 4 |
| `live-unit` | 1 | 4 |
| `live-trade-symbol` | 1 | 4 |
| `live-trade-outcome` | 1 | 4 |
| `order-ticket` | 1 | 3 |
| `notice-text` | 1 | 3 |
| `single-line` | 1 | 3 |
| `placeholder-page` | 1 | 3 |
| `colhead-arrow` | 2 | 2 |
| `phase-scanning` | 1 | 1 |
| `phase-waiting_entry` | 1 | 1 |
| `phase-active` | 1 | 1 |
| `bot1` | 1 | 1 |
| `bot2` | 1 | 1 |
| `bot4` | 1 | 1 |
| `bot5` | 1 | 1 |
| `bot6` | 1 | 1 |
| `bot7` | 1 | 1 |

### desktop.css — 51개 확실, 3개 동적 의심

동적 의심: `wm-divider-both`(접두어 `wm-divider-`), `half-top`(접두어 `half-`), `half-bottom`(접두어 `half-`)

| 클래스 | 규칙 | 줄 |
|---|---|---|
| `web-login-field` | 4 | 21 |
| `chart-dd-btn` | 3 | 19 |
| `current-price-tag` | 1 | 15 |
| `market-row` | 7 | 15 |
| `web-login-btn` | 2 | 12 |
| `header-btn` | 1 | 10 |
| `bar-count` | 1 | 10 |
| `market-chip` | 2 | 10 |
| `web-list-row` | 2 | 9 |
| `symbol-headline` | 5 | 9 |
| `price-tick` | 1 | 9 |
| `time-tick` | 1 | 9 |
| `panel-assets-full` | 1 | 9 |
| `web-login-card` | 1 | 9 |
| `ob-settings-row` | 2 | 9 |
| `current-price-line` | 1 | 8 |
| `time-axis` | 1 | 8 |
| `market-head` | 1 | 8 |
| `web-login-logo` | 2 | 8 |
| `paper-toggle` | 3 | 7 |
| `paper-order-open` | 3 | 7 |
| `price-scale` | 1 | 7 |
| `web-login` | 1 | 7 |
| `web-login-sub` | 1 | 7 |
| `strat-subtab` | 3 | 7 |
| `paper-reset-btn` | 2 | 6 |
| `chart-candles` | 2 | 6 |
| `market-filters` | 1 | 5 |
| `market-list` | 1 | 5 |
| `web-list-name` | 1 | 4 |
| `pc-action` | 4 | 4 |
| `web-login-error` | 1 | 4 |
| `web-list-chg` | 3 | 3 |
| `counterparty-select` | 2 | 2 |
| `web-list-col` | 1 | 1 |
| `web-list-sym` | 1 | 1 |
| `web-list-right` | 1 | 1 |
| `web-list-price` | 1 | 1 |
| `paper-soon` | 1 | 1 |
| `poscard-actions` | 1 | 1 |
| `pc-close` | 1 | 1 |
| `info-circle` | 1 | 1 |
| `counterparty-row` | 1 | 1 |
| `single-line` | 1 | 1 |
| `view-hidden` | 1 | 1 |
| `sh-sym` | 1 | 1 |
| `sh-name` | 1 | 1 |
| `wps-outcome-tp` | 1 | 1 |
| `wps-outcome-sl` | 1 | 1 |
| `wps-outcome-etc` | 1 | 1 |
| `strat-subtabs` | 1 | 1 |

검증 메모: html·`sw.js`에도 대조했다. 미사용 목록 중 html/js에 문자열이 나오는 것은 `badge` 하나이고, `sw.js`의 push notification 옵션(`badge:` 아이콘 경로)이라 CSS 클래스 사용이 아니다. 상위 6개(`counterparty-select`·`stock-strip`·`asset-actions`·`web-login-field`·`chart-dd-btn`·`current-price-tag`)는 수동 grep으로도 0건임을 확인했다.

## 5. labs 전용 클래스 (d01 사용자 결정)

`apps/web/src`에는 없고 `labs/trading/web/src`(Beta에서 분리한 자동매매·Paper·Backtest UI 보존본)에만 나오는 클래스. labs는 진입점 없이 타입체크만 하므로 이 규칙을 지워도 Beta는 깨지지 않는다. 선택지: (a) 삭제(추천, Git 이력에서 복원 가능) (b) `labs/trading/web/src/styles/`로 이동.

### mobile.css — 46개, 규칙 100개, 약 728줄

```text
long-button, short-button, trade-select, val-input, premium-switch-slider, currency-selector, input-label, live-ob-chip, premium-select, premium-switch, custom-checkbox, premium-select-wrapper, open-close-toggle, pill-btn, live-page, balance-line, live-trade-row, pct-btn, live-header, bbo-button, trade-input-wrapper, green, dashboard-stat-card, percent-row, trade-checkbox-label, futures-ticket, balance-lines, muted, live-card-label, dashboard-grid, trade-pills, checkbox-text, live-no-pos, live-trade-pnl, dashboard-stat-label, dashboard-stat-value, success, shrink-s, red, live-trades, phase-waiting, near, ltc, wld, inj, shib
```

### desktop.css — 66개, 규칙 116개, 약 137줄

```text
web-monitoring, long-button, short-button, live-ob-chip, paper-order-head, pill-btn, bbo-button, open-close-toggle, price-line, trade-input-wrapper, custom-checkbox, val-input, balance-line, paper-oo-dir, wps-stat-v, wps-dir, wps-cell, po-symhead, po-logo, po-ex, pct-btn, paper-oo-cancel, wps-sym-link, paper-order-title, paper-order-body, po-logo-fb, po-sym, paper-order-err, futures-ticket, trade-pills, shrink-s, trade-select, trade-checkbox-label, checkbox-text, input-label, currency-selector, percent-row, balance-lines, paper-open-orders, paper-oo-title, paper-oo-row, paper-oo-sym, paper-oo-px, wps-panel, wps-head, wps-title, wps-updated, wps-stats, wps-stat, wps-stat-k, wps-dd, wps-badge, wps-badge-ok, wps-badge-warn, wps-badge-kill, wps-sec-title, wps-empty, wps-row, wps-sym, wps-right, wps-outcome, wps-trade, wps-meta, live-no-pos, phase-waiting, web-monitoring-list
```

## 6. `:root` 토큰 (d05 판단 자료)

| 토큰 | mobile.css | desktop.css |
|---|---|---|
| `--bg` | `#0d1017` | `#000000` |
| `--blue` | `#3182f6` | `#3182F6` |
| `--border` | `—` | `transparent` |
| `--border2` | `—` | `transparent` |
| `--chart-bg` | `—` | `#060606` |
| `--down` | `#f6465d` | `#f6465d` |
| `--gap` | `—` | `12px` |
| `--lightningcss-dark` | `initial` | `—` |
| `--lightningcss-light` | `` | `—` |
| `--line` | `#ffffff14` | `—` |
| `--muted` | `#8b96a8` | `#8b95a1` |
| `--panel` | `#151a23` | `—` |
| `--panel-2` | `#1b2230` | `—` |
| `--radius` | `—` | `12px` |
| `--sidebar` | `—` | `#050505` |
| `--surface` | `—` | `#0c0c0c` |
| `--surface2` | `—` | `#131313` |
| `--text` | `#edf1f7` | `#eaecef` |
| `--text2` | `—` | `#b7bdc6` |
| `--text3` | `—` | `#8a8c90` |
| `--up` | `#0ecb81` | `#0ecb81` |

공통 토큰 6개 중 값이 같은 것은 `--up`·`--down` 2개뿐이다. 나머지(`--bg`, `--muted`, `--text`, `--blue`)는 앱마다 다르다. 공통 `tokens.css`로 올릴 만한 건 2개라 d05는 생략하는 쪽이 자연스럽다(사용자 결정).

## 7. d01~d04 착수 순서 제안

1. d01: 4절 "확실" 목록 삭제 + 5절 labs 전용 규칙 처리. 삭제 후 규칙 수 = 원본 − 삭제분, computed style 동일.
2. d02: `chart/indicators` owner 규칙(양쪽 14개·85줄, 본문 33% 상이)과 `chart` owner 규칙을 `chart/` 옆으로. OQ-12 결정 필요.
3. d03: Mobile owner 규칙을 `pages/`·`components/{trade,coin-list,sheets}` 옆으로. 이때 `desktop.css`의 `app/mobile/components/trade` 복사본(34규칙·135줄)을 같이 정리해 한 곳으로.
4. d04: Desktop owner 규칙을 `panels/`·`WebApp.css`·`WebLogin.css`로. `desktop.css`에는 `:root`·reset·셸만.
