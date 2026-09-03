# AutoTrade Design System

AutoTrade is a dense dark-mode crypto trading operations dashboard. The primary user is a trader who repeatedly checks live positions, pending orders, monitoring signals, and account status throughout the day. The interface should feel professional, compact, fast to scan, and built for operational use. Do not redesign it as a marketing landing page.

## Product Goals

- Show live account status, positions, pending orders, and strategy monitoring in one compact workflow.
- Prioritize scanability over decoration.
- Keep controls predictable for repeated daily use.
- Make trading states visually obvious without requiring long explanations.
- Preserve the existing information architecture: Live tab, positions, pending orders, monitoring, signal filters, phase filters, and monitoring cards.
- Preserve the existing AutoTrade/BOTZ logo assets exactly.
- Preserve the existing bottom tab/navigation design. Do not replace it with a new navigation pattern.
- Evolve the current design rather than replacing it. Keep the existing color palette, dark visual identity, and layout structure mostly intact.

## Visual Direction

The app should look like a modern crypto trading terminal:

- Dark, low-glare background.
- Compact panels and rows.
- Clear hierarchy through weight, spacing, and color.
- Subtle borders instead of heavy cards.
- No hero sections, marketing copy, large illustrations, decorative gradients, blobs, or oversized empty space.
- Use small status indicators, segmented controls, chips, tables, and dense data cards.
- Do not redesign, recolor, simplify, or replace the existing logos.
- Do not redesign the bottom tab/navigation. Keep its structure and visual identity; only minor spacing or polish is acceptable.
- Do not make a radical visual redesign. Improvements should be subtle and precise: spacing, alignment, hierarchy, card density, contrast, and interaction clarity.

## Color Tokens

Use these colors as the source of truth:

- App background: `#000000`
- Primary surface: `rgba(255,255,255,0.02)`
- Secondary surface: `rgba(255,255,255,0.04)`
- Control surface: `rgba(255,255,255,0.05)`
- Active control surface: `rgba(255,255,255,0.14)`
- Border subtle: `rgba(255,255,255,0.05)`
- Border normal: `rgba(255,255,255,0.08)`
- Text primary: `#ffffff`
- Text secondary: `#cfd3da`
- Text muted: `#8b95a1`
- Text disabled: `#58606c`
- Profit / long / online: `#0ecb81`
- Loss / short / offline: `#f6465d`
- Signal / warning / PRZ touch: `#f5a623` or `#f3ba2f`
- Done / cancelled / neutral: `#58606c`
- Blue accent, only when needed for scanning state: `#3182f6`

Use green and red only for market direction, profit/loss, TP/SL, or online/offline state. Avoid using them as generic decoration.

## Typography

- Use a clean sans-serif system font.
- Keep letter spacing normal.
- Do not use viewport-based font scaling.
- Main navigation labels: 15px, 600 weight.
- Card symbols: 14px, 700 weight.
- Main numeric values: 14-20px, 700-800 weight depending on importance.
- Secondary labels: 11-13px, 500-600 weight.
- Badges: 9-12px, 700-800 weight.
- Keep text short. Trading screens should be scannable.

## Shape And Spacing

- Cards and rows should use 8-12px radius.
- Avoid large rounded pill cards except for small chips.
- Use compact spacing:
  - Page horizontal padding: 14px.
  - Card padding: 10-16px.
  - Row gap: 8-12px.
  - Section gap: 16-24px.
- Use subtle borders and transparent surfaces.
- Do not nest large decorative cards inside other large cards. Repeated signal rows can be card-like.

## Core Layout

The Live page has this structure:

1. Header
   - Shows worker/bot online status.
   - Small online dot with green when online and red when offline.

2. Asset summary
   - Shows total account value.
   - Supports USDT/KRW display.
   - Should be prominent but not hero-sized.

3. Account accordion
   - Shows main account and sub-account status.
   - Uses compact rows with status, balance, positions, and risk numbers.

4. Sticky live control bar
   - Top-level tabs:
     - `포지션`
     - `미체결`
     - `모니터링`
   - The active tab is white; inactive tabs are muted gray.
   - It stays sticky at the top while scrolling.

5. Tab body
   - Positions tab: open positions.
   - Pending tab: pending orders.
   - Monitoring tab: strategy signal monitoring cards.

## Brand And Navigation Preservation

The uploaded logo and icon assets are part of the existing product identity. Preserve them exactly:

- `assets/at-logo.svg`
- `assets/botz-icon.svg`
- `assets/botz-icon-512.png`
- `assets/botz-mark.svg`

Rules:

- Do not create a new logo.
- Do not recolor the logo.
- Do not simplify or replace the mark.
- Do not substitute a generic crypto icon.
- Do not replace the existing bottom tab/navigation design with a new navigation pattern.
- Bottom navigation can receive small spacing, contrast, or alignment improvements only if the original design remains recognizable.

## Redesign Scope

This project needs design refinement, not a new visual direction.

Keep mostly unchanged:

- Overall dark trading-dashboard identity.
- Existing black background and green/red trading semantics.
- Main Live page layout.
- Bottom tab/navigation design.
- Brand logo and app icon assets.
- Monitoring workflow: signal type filter, SMC timeframe filter, phase filter, done outcome filter, and signal cards.

Improve carefully:

- Spacing consistency between controls and cards.
- Text hierarchy and numeric emphasis.
- Alignment of card rows, badges, and metric grids.
- Visual grouping of filters.
- Empty states and dense list readability.
- Subtle contrast of surfaces and borders.
- Mobile scanability without increasing vertical bulk too much.

Avoid:

- New brand colors.
- New logo concepts.
- New navigation patterns.
- Marketing-style hero layouts.
- Large decorative imagery.
- Overly rounded, playful, or consumer-social styling.
- Dramatic gradients or one-note color themes.

## Live Control Bar

The monitoring tab has two filter levels:

### Signal Type Segmented Control

Use a segmented control, not separate floating chips.

Options:

- `Harmonic`
- `AB=CD`
- `SMC`

Rules:

- Exactly one signal type is selected.
- Active segment uses `rgba(255,255,255,0.14)` and white text.
- Inactive segments use transparent background and muted text.
- Container uses `rgba(255,255,255,0.05)`, `rgba(255,255,255,0.08)` border, 8px radius, and 2px padding.

### SMC Timeframe Segmented Control

Only show this when SMC is selected.

Options:

- `월봉`
- `주봉`

It uses the same segmented control style as the signal type filter.

### Phase Filter Row

Below the signal type row, show phase chips:

- `탐색`
- `신호`
- `체결`
- `종료`

Each chip includes a count. This row should be visually separate from the signal type segmented control. Use compact chip styling.

State colors:

- 탐색: muted gray or subtle blue.
- 신호: amber.
- 체결: green.
- 종료: neutral gray.

## Monitoring Cards

Monitoring cards show strategy signals from Worker snapshots. They must support three strategy families:

- Harmonic
- AB=CD
- SMC

Each card should include:

- Symbol, e.g. `BTC`, `ETH`, `FARTCOIN`.
- Direction badge: `LONG` green or `SHORT` red.
- Current price and current percentage vs entry/mid when available.
- Phase status:
  - 탐색 중
  - 신호
  - 체결
  - 완료
- Small phase progress indicator with three dots connected by a line.
- Entry or mid price.
- TP/SL values.
- Pattern or zone name.
- Time label.

### Strategy Icon Rules

Use small icons instead of writing strategy names in large text:

- Harmonic: W/M zigzag icon.
- AB=CD: three-leg zigzag icon.
- SMC: zone rectangle with a center line.

The pattern name remains visible, but the strategy family can be implied by the icon.

### Pattern Strategy Card Metrics

For Harmonic and AB=CD:

- Show `Entry`
- Show `SL`
- Show `TP1`
- Show `TP2`
- Use a 2-column compact metric grid.

### SMC Card Metrics

For SMC:

- Show `기준 Mid`
- Show `TP`
- Show `SL`
- Use a 3-column compact metric grid.

### Monitoring Phases

Map phases as follows:

- `scanning` or `waiting`: 탐색
- `waiting_entry` or `signal`: 신호 / PRZ touch
- `active`: 체결
- `done`: 종료

Use these colors:

- active / filled: green `#0ecb81`
- signal / PRZ touch: amber `#f5a623`
- done / cancelled: gray `#58606c`
- long: green
- short: red

## Done Outcome Filtering

When the phase filter is `종료`, show a secondary done outcome filter:

- 전체
- TP
- SL
- 폐기

Outcome mapping:

- TP:
  - `tp`
  - `tp1`
  - `tp2`
  - anything beginning with `tp`
- SL:
  - `sl1`
  - `sl`
  - `본절`
- 폐기:
  - `cancelled`
  - `invalidated`
- Timeout:
  - `timeout`
  - show as neutral unless a specific result is calculated

Important: SMC uses `sl` for stop loss and `invalidated` for invalidated zones. These must be counted and displayed. Do not show TP-only results as if win rate is 100%.

Outcome labels:

- `cancelled`: `폐기: 0.5 미체결(TP1 선도달)`
- `invalidated`: `폐기: 존 무효(종가 돌파)`
- `sl`: `손절(종가 돌파)`
- `sl1`: `손절`
- `tp`: `익절`
- `tp1`: `전량익절(TP1)` or `TP1익절+본절` depending on context
- `tp2`: `전량익절(TP2)`
- `timeout`: `타임아웃`

## Position And Pending Cards

Position cards should show:

- Symbol and direction.
- Unrealized PnL and ROE.
- Entry price.
- Current price.
- TP and SL.
- Leverage.

Pending cards should show:

- Symbol and direction.
- Order price.
- TP price.
- SL price.
- Order type.

Use the same compact row/card design as monitoring cards.

## Interaction Rules

- Clicking a symbol should open/select the futures chart for that symbol.
- Filters should not cause layout jumps.
- Segmented controls should clearly show single-select behavior.
- Horizontal overflow is allowed for filter rows on mobile.
- Sticky controls should not obscure content.
- Empty states should be quiet and compact, e.g. `내역이 없습니다.`

## Mobile Behavior

The app is mobile-first but should also work on desktop:

- Keep controls touch-friendly without becoming oversized.
- Use horizontal scrolling for filter rows when needed.
- Do not allow text to overflow buttons or cards.
- Cards should stack vertically.
- Metric grids must remain readable on narrow screens.
- Avoid fixed widths that break on small screens.

## Desktop Behavior

On larger screens:

- Keep the same operational dashboard feel.
- Content may become wider, but avoid stretched sparse layouts.
- Use constrained content widths or denser grids if needed.
- Do not turn the interface into a landing page.

## Screens To Design Or Improve

Focus on these screens first:

1. Live dashboard
2. Monitoring tab
3. Position tab
4. Pending orders tab
5. Account accordion

Secondary screens can follow the same design language:

- Strategy configuration
- Backtest result panel
- Chart detail view
- Settings and trade config management

## Stitch Prompt Guidance

Use this guidance when generating designs:

```text
Use this DESIGN.md as the source of truth.
Redesign AutoTrade as a dense, professional dark-mode crypto trading operations dashboard.
Keep the existing information architecture: Live tab, positions, pending orders, monitoring, signal type segmented control, SMC monthly/weekly segmented control, phase filters, and monitoring cards.
Do not create a landing page.
Do not add decorative gradients, marketing sections, or large empty hero areas.
Preserve the existing AutoTrade/BOTZ logo assets exactly. Do not redesign, recolor, simplify, or replace the logo.
Preserve the existing bottom tab/navigation design. Do not replace it with a new navigation pattern.
Keep the current color palette and layout direction mostly intact. Refine and develop the existing design instead of creating a new visual identity.
Prioritize scanability, compact controls, clear hierarchy, and repeated daily use.
Use green only for profit/long/online, red only for loss/short/offline, amber for signal/warning, and gray for done/cancelled/neutral states.
Make monitoring cards clearly distinguish Harmonic, AB=CD, and SMC using compact icons and labels.
Ensure SMC done outcomes classify sl as stop loss and invalidated as cancelled/invalidated zone.
```

## Reference Implementation Files

The current React implementation is in:

- `frontend/src/pages/LivePage.tsx`
- `frontend/src/components/live/LiveControlBar.tsx`
- `frontend/src/components/live/LiveMonitoringTab.tsx`
- `frontend/src/components/live/LivePositionTab.tsx`
- `frontend/src/components/live/LivePendingTab.tsx`
- `frontend/src/components/live/LiveAccountAccordion.tsx`
- `frontend/src/components/live/LiveAssetSummary.tsx`
- `frontend/src/styles.css`

Use screenshots of the current app together with this file for best results.
