---
schema: ai-workflow/work-package@1
id: wp-05-desktop-naming
title: web → desktop 이름 통일 (파일·식별자·빌드 이름)
workstream: refactor
state: active
updated: 2026-09-04
depends_on: [wp-04-css-cleanup]
supersedes: []
outcome: "Desktop 앱을 가리키던 'web' 이름(파일·컴포넌트·빌드 스크립트·산출물 폴더)이 'desktop'으로 바뀌어 app/desktop 폴더 이름과 일치한다. URL /web과 apps/web 폴더는 그대로다. 동작·화면은 변화 없다."
acceptance:
  - "AC-001: apps/web 안에서 Desktop 앱을 뜻하는 'web' 이름이 0이다. 남는 'web'은 apps/web(프론트엔드 전체), URL /web(배포 경로, T-05), WebSocket, labs 보존 코드뿐이다 (git grep으로 잔여 목록 확인)."
  - "AC-002: 각 Delivery 후 tests 22·build 2종·lint error 0·번들 제외 문자열 0·labs tsc가 유지되고, dev 서버 Mobile·Desktop이 로드된다."
  - "AC-003: 변경은 rename·import 경로·식별자 치환·설정 문자열뿐이다. 로직·마크업·CSS 값은 바꾸지 않는다."
  - "AC-004: docs/COMMANDS.md·README·STRUCTURE.md의 명령·경로가 실제와 일치한다."
deliveries:
  - id: wp-05-d01-source
    title: "app/desktop 파일·컴포넌트 이름 — Web* → Desktop* 또는 접두어 제거"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: refactor/naming-d01-source
    pull_requests: [40]
    evidence:
      - kind: parity-check
        locator: "git mv 10개(DesktopApp·DesktopLogin·DesktopSignup +css, panels/MarketPanel·WatchlistPanel·FavoritesPanel·DrawingToolbar·RsiSettingsPanel), 식별자 12종 단어 경계 치환 13 파일 47줄, labs 변경 0(snapFloat 경로 유지). app/desktop에 Web* 식별자 0. 표와 다른 점: Watchlist·RsiSettings는 기존 타입 이름과 충돌해 *Panel 접미어"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "lint 0 · tests 22 · build 2종 · 번들 문자열 0 · labs tsc. dev 서버 Desktop /web/ 새 모듈 이름으로 렌더링(차트·패널 5), Mobile 200. 조사 중 5174 서버에서 Mobile 진입점을 열면 virtual:pwa-register 500이 나는 것은 Desktop config에 PWA 플러그인이 없는 기존 동작(d02에서 리라이트 정리)"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-05-d02-build
    title: "진입점·빌드 이름 — web.html, vite.config.web.js, build:web, dist-web, CI·ops 스크립트"
    kind: git
    state: active
    repository: .
    depends_on: [wp-05-d01-source]
    branch: refactor/naming-d02-build
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "git mv web.html→desktop.html, vite.config.web.js→vite.config.desktop.js. package.json(bubot-web, dev:desktop, build:desktop), eslint ignores·.gitignore(dist-desktop·.vite-desktop), ci.yml(build:desktop), ops/front-end.sh(config·문구), ops/deploy.sh(build:desktop·dist-desktop·desktop.html→index.html, static/web 경로 유지). base '/web/'·URL 유지. dev 리라이트를 쿼리스트링 포함 경로로 확장"
        revision: working-tree
        observed_at: 2026-09-04
      - kind: command
        locator: "lint 0 · tests 22 · build · build:desktop(dist-desktop/desktop.html) · 번들 문자열 0 · labs tsc. Desktop dev 서버를 vite.config.desktop.js로 재기동: /web/ 와 /web/?r=2 모두 desktop.html(main.tsx desktop) 서빙, 차트 렌더링. Mobile 5175 200"
        revision: working-tree
        observed_at: 2026-09-04
  - id: wp-05-d03-docs
    title: "문서 갱신, web-mockup.html 처리, 잔여 'web' 목록 확정"
    kind: git
    state: planned
    repository: .
    depends_on: [wp-05-d02-build]
    branch: docs/naming-d03
    pull_requests: []
    evidence: []
milestones:
  - id: desktop-naming-done
    title: "이름 통일 완료"
    state: pending
    depends_on: [wp-05-d03-docs]
    acceptance:
      - "GATE-AC-001: AC-001~AC-004 확인 (잔여 grep 목록이 예외 4종뿐, Gate 통과, 문서 일치)."
      - "GATE-AC-002: 사용자가 로컬 기동에서 Desktop 로그인·차트·패널을 육안 확인."
    unlocks: []
    evidence: []
extensions: {}
---

# web → desktop 이름 통일

## 범위

포함 (2026-09-04 조사, `main 6adc8ce`):

- `app/desktop/` 파일 10개: `WebApp`·`WebLogin`·`WebSignup`(+css)과 `panels/Web*` 5개
- 파일 안 식별자: `WebSymbolRow`·`WebDrawingSettings`·`WebDrawingFloatBar`·`WebObjectTree`·`WebMonitoringPanelProps` 등 컴포넌트·타입 이름
- 진입점·빌드: `web.html`, `vite.config.web.js`(주석·플러그인 이름 `serve-web-html-in-dev` 포함), `package.json`의 `dev:web`·`build:web`·이름 `bullum-web`, `dist-web`, `.vite-web`, `eslint.config.js` ignores, `.gitignore`
- 스크립트·CI: `.github/workflows/ci.yml`(`build:web`), `ops/front-end.sh`(config 경로·안내 문구), `ops/deploy.sh`(빌드 명령·`dist-web` 경로·`web.html → index.html` 단계)
- labs: `labs/trading/web/src`의 `@web/app/desktop/...` import 경로는 파일 이름을 따라간다
- 문서: `docs/COMMANDS.md`, `README.md`, `docs/architecture/STRUCTURE.md`, `work-status/CURRENT.md`

제외:

- `apps/web` 폴더 이름 — 프론트엔드 전체를 뜻하므로 유지
- URL `/web`(`vite.config` base, Spring `FileMappingConfig`, `deploy.sh`의 `static/web`) — 배포 경로와 묶여 있어 T-05 배포 WP에서 결정. `index.html`(Mobile)도 Vite 기본이라 유지
- `WebSocket`, `labs/trading/web` 폴더 이름과 그 안의 `WebMonitoringPanel`·`WebPaperOrder` 등 보존 코드의 식별자
- 과거 PLAN·검토 문서(`WEB-STRUCTURE-REVIEW`·`WEB-CSS-REVIEW`)의 본문 — 역사 기록이라 손대지 않음
- 컴포넌트 분해·로직 변경 (T-04d)

## 이름 규칙 (사용자 확정 대상)

| 현재 | 제안 | 근거 |
|---|---|---|
| `WebApp.tsx` / `.css` | `DesktopApp.tsx` / `.css` | Mobile의 `App.tsx`와 구분. 진입 컴포넌트는 앱 이름을 남김 |
| `WebLogin` / `WebSignup` | `DesktopLogin` / `DesktopSignup` | Mobile `LoginPage`와 구분 |
| `panels/WebMarketPanel` 등 5개 | `panels/MarketPanel`·`WatchlistPanel`·`FavoritesPanel`·`DrawingToolbar`·`RsiSettingsPanel` | `app/desktop/panels/` 경로가 이미 Desktop을 말하므로 접두어 제거. `Watchlist`·`RsiSettings`는 기존 타입 이름과 충돌해 `Panel` 접미어(d01 실행 시 확인) |
| 파일 안 `WebSymbolRow`·`WebDrawingSettings`·`WebDrawingFloatBar`·`WebObjectTree` | 접두어 제거 | 위와 같음 |
| `web.html` | `desktop.html` | 진입 HTML. Mobile `index.html`은 유지 |
| `vite.config.web.js` | `vite.config.desktop.js` | |
| `dev:web` / `build:web` | `dev:desktop` / `build:desktop` | CI·ops·문서 동시 갱신 |
| `dist-web` / `.vite-web` | `dist-desktop` / `.vite-desktop` | eslint ignores·.gitignore·deploy.sh 동시 갱신 |
| `bullum-web` (package name) | `bubot-web` | OQ-10 Bullum 문구의 일부. `web`은 프론트엔드 뜻이라 유지 |
| `web-mockup.html` | 삭제 또는 `docs/design/`으로 이동 | 디자인 시안 파일. d03에서 사용자 결정 |

## 진행 방식

- 사용자와 Delivery 단위로 진행한다. d01 시작 전 위 표를 확정받는다.
- rename은 `git mv`, 식별자·경로 치환은 스크립트로 하고 `git diff -M`으로 rename과 치환 줄만 바뀌었는지 확인한다. 치환은 단어 경계(`\bWebApp\b`)로만 하고 `WebSocket`·`labs` 식별자는 제외 목록으로 보호한다.
- Gate: `npm test`(22) · `npm run build` · `npm run build:desktop` · `npm run lint`(error 0) · 번들 grep · labs `tsc` · dev 서버 Mobile(5175)·Desktop(5174) 로드. d02 후에는 `ops/front-end.sh`로 실제 기동해 새 config 이름을 확인한다.
- 잔여 확인: `git grep -niE "web" apps/web ops .github` 결과를 예외 4종(apps/web 경로, URL /web, WebSocket, labs)으로 분류해 d03 evidence에 남긴다.

## Delivery Notes

### wp-05-d01-source
- `app/desktop/` 안 rename 10개 + 식별자 치환 + importer 경로(Mobile·chart에서 참조하는 곳은 없음, labs `@web/app/desktop/...` 경로 갱신).
- CSS import 줄(`./WebApp.css` → `./DesktopApp.css`)도 같이.

### wp-05-d02-build
- `web.html` → `desktop.html`(script 경로는 그대로), `vite.config.desktop.js`(base `/web/` 유지, `outDir`·`cacheDir`·플러그인 이름·주석 갱신, dev 서버의 `/web/ → desktop.html` 리라이트).
- `package.json` 스크립트·이름, `eslint.config.js`, `.gitignore`, `ci.yml`, `ops/front-end.sh`, `ops/deploy.sh`(`build:desktop`, `dist-desktop`, `desktop.html → index.html`; `static/web` 경로는 유지).
- 로컬 `.vite-web`·`dist-web` 폴더는 Git 밖이라 삭제만 안내.

### wp-05-d03-docs
- `docs/COMMANDS.md`·`README.md`·`STRUCTURE.md`·`CURRENT.md`의 명령·경로·트리 갱신. `web-mockup.html` 처리. 잔여 grep 목록을 evidence로.
