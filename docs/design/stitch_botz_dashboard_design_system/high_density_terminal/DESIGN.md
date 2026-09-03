---
name: High-Density Terminal
colors:
  surface: '#0d1510'
  surface-dim: '#0d1510'
  surface-bright: '#333b35'
  surface-container-lowest: '#08100b'
  surface-container-low: '#161d18'
  surface-container: '#1a211c'
  surface-container-high: '#242c26'
  surface-container-highest: '#2f3731'
  on-surface: '#dce5dc'
  on-surface-variant: '#bbcabd'
  inverse-surface: '#dce5dc'
  inverse-on-surface: '#2a322c'
  outline: '#859489'
  outline-variant: '#3c4a40'
  surface-tint: '#3be194'
  primary: '#45e89b'
  on-primary: '#003920'
  primary-container: '#0ecb81'
  on-primary-container: '#004f2f'
  inverse-primary: '#006d42'
  secondary: '#ffb3b5'
  on-secondary: '#680018'
  secondary-container: '#ac012f'
  on-secondary-container: '#ffb7b9'
  tertiary: '#ffbfa2'
  on-tertiary: '#571f00'
  tertiary-container: '#ff9764'
  on-tertiary-container: '#762e01'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#60feae'
  primary-fixed-dim: '#3be194'
  on-primary-fixed: '#002111'
  on-primary-fixed-variant: '#005231'
  secondary-fixed: '#ffdada'
  secondary-fixed-dim: '#ffb3b5'
  on-secondary-fixed: '#40000b'
  on-secondary-fixed-variant: '#920026'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb694'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7a3003'
  background: '#0d1510'
  on-background: '#dce5dc'
  surface-variant: '#2f3731'
  bg-base: '#000000'
  surface-primary: rgba(255, 255, 255, 0.02)
  surface-secondary: rgba(255, 255, 255, 0.04)
  surface-control: rgba(255, 255, 255, 0.05)
  surface-active: rgba(255, 255, 255, 0.14)
  accent-blue: '#3182f6'
  status-warning: '#f5a623'
  text-primary: '#ffffff'
  text-secondary: '#cfd3da'
  text-muted: '#8b95a1'
  border-subtle: rgba(255, 255, 255, 0.05)
  border-normal: rgba(255, 255, 255, 0.08)
typography:
  display-asset:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-symbol:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 24px
  body-main:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  body-numeric:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  badge-tiny:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '800'
    lineHeight: 12px
  nav-label:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  page-margin: 14px
  card-padding: 12px
  gap-compact: 8px
  gap-section: 20px
  touch-target: 40px
---

## Brand & Style

The design system is engineered for professional cryptocurrency traders who require high-velocity data scanning and operational precision. The brand personality is **Technical, Authoritative, and Tactical**, eschewing consumer-focused marketing fluff for a utilitarian "terminal" aesthetic. 

The visual style is a blend of **Minimalism** and **High-Density Corporate**, specifically optimized for dark environments. It prioritizes information density over decorative white space, utilizing "Perfect Black" backgrounds to maximize the contrast of semantic trading signals. Layouts are structured to behave like a mission-control dashboard, where every pixel serves a functional purpose in monitoring live market movements and bot activity.

## Colors

The palette is strictly functional. The primary background is a true black (`#000000`) to eliminate glare during long trading sessions and provide the highest possible contrast ratio for critical data.

- **Primary (`#0ecb81`)**: Reserved exclusively for "Up," "Profit," "Long," and "Online" states.
- **Secondary (`#f6465d`)**: Reserved for "Down," "Loss," "Short," and "Offline" states.
- **Tertiary/Warning (`#f5a623`)**: Used for "Signal," "Warning," or "PRZ Touch" events.
- **Surfaces**: Depth is created using incremental opacities of white over the black base, rather than unique hex codes, ensuring a cohesive "glass-on-black" feel. 
- **Accent Blue**: Utilized sparingly only when a non-semantic interactive state needs to be highlighted.

## Typography

This design system uses a system-first typography approach centered on **Inter** for its exceptional legibility in small, data-heavy contexts.

- **Hierarchy**: Distinction is achieved through font weight (700-800 for data points) rather than large size jumps, maintaining high information density.
- **Numeric Clarity**: Tabular lining is preferred for price and balance displays to prevent layout shifting during live updates.
- **Mobile optimization**: Headings are kept compact (max 32px) to ensure multi-column data grids remain visible on mobile viewports without excessive scrolling.

## Layout & Spacing

The layout operates on a strict **4px grid system**. The philosophy is "Compact & Fluid," prioritizing the visibility of as many rows as possible in the initial viewport.

- **Grid Model**: A fluid 12-column grid is used for desktop, while mobile relies on a single-column stack of cards with 14px horizontal page margins.
- **Dense Grouping**: Component gaps are set to 8px or 12px to keep related data points (like TP/SL levels) visually coupled.
- **Fixed Elements**: The Bottom Tab Bar and the Live Control Bar are fixed/sticky to ensure navigational persistence regardless of scroll depth.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** rather than traditional drop shadows. In a true-black environment, depth is perceived by the gradual lightening of surfaces.

- **Level 0 (Background)**: Pure `#000000` for the main canvas.
- **Level 1 (Panels)**: `rgba(255,255,255,0.02)` surfaces with a `1px` subtle border at `0.05` opacity.
- **Level 2 (Interactive Controls)**: `rgba(255,255,255,0.05)` for inputs and segmented control tracks.
- **Overlays**: Draggable bottom sheets and profile menus use a slightly more opaque background with a backdrop blur (12px) to maintain context while focusing on the specific task.

## Shapes

The shape language is **Soft-Technical**. We use moderate rounding to prevent the UI from feeling "sharp" or "hostile," but avoid the pill-shaped "bubbly" aesthetic of consumer apps.

- **Cards & Row Containers**: 8px or 12px corner radius.
- **Segmented Controls**: 8px radius for the container, with internal segments mirroring the parent.
- **Status Indicators**: Tiny circles (dots) or small 4px radius badges.
- **Buttons**: Consistent 8px radius across all primary actions.

## Components

### Buttons & Inputs
- **Primary Action**: Solid blue or semantic green/red, but with a maximum 10px vertical padding to maintain density.
- **Segmented Controls**: The primary navigation pattern for filters (Harmonic/SMC). Active segments use `surface-active` and white text; inactive segments are transparent.

### Monitoring Cards
- **Structure**: A 2-column or 3-column metric grid for prices (Entry, SL, TP).
- **Strategy Icons**: Use small, stylized icons (Zigzag for Harmonic, Rectangles for SMC) to distinguish strategy families without using text strings.
- **Progress Indicators**: A three-dot linear connector showing the current trade phase (Scanning -> Signal -> Filled -> Done).

### Status Badges
- **Direction**: Compact badges with `UP` (Green) or `DOWN` (Red) text using `badge-tiny` typography.
- **Connectivity**: A pulsating 8px dot indicates live worker status.

### Lists & Tables
- **Standard Rows**: 48px to 56px fixed height for predictable scanning.
- **Dividers**: 1px solid `border-subtle`, never pure white or heavy gray.