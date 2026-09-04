# 현재 상태

- 마지막 갱신: 2026-09-04 (wp-07 PLAN 작성)

> 이 문서는 다음 세션을 위한 상태판이다. 이력을 쌓지 않고 덮어쓴다.
> Branch·Commit·작업 트리는 Git에서, 완료 작업의 상세·증거는 PLAN과 Git History에서 확인한다.
>
> 상태별 자리: 결정 안 됨 → `OPEN-QUESTIONS.md` · 승인·시기 대기 → `Deferred` ·
> 막힘 → `Blocker·주의` · 결정됐고 할 것 → `TODO` · 완료 → 각 PLAN과 Git.

## 현재 목표

- 기준선 Track 완료(2026-09-03, PR #3~#7): `shared`·`apps/api`·`apps/web`·`labs/trading/worker`·`ops`가 원본 `develop`과 blob hash 동일하게 들어왔고, Web tests 22·build 2종·API bootWar·`ops/verify` 6종이 원본과 같은 결과다.
- 배포 전 품질 정리 완료(2026-09-03): README, CI lint(error 0·warning baseline 320), API test(H2 test 프로필), Ruleset `main-protection`.
- `apps/web` 폴더 구조 재편 완료(2026-09-03, `wp-03-web-structure`, PR #24~#30): `app/{mobile,desktop}` · `chart` · `hooks/{market,account,ui}` · `api/{client,server,exchange}` · `shared`. 의존 방향 규칙은 `docs/PROJECT.md`.
- `apps/web` CSS 정리 완료(2026-09-04, `wp-04-css-cleanup`, PR #32~#37): 미사용 242 규칙 삭제, labs 전용 148 규칙 `labs/trading/web/src/styles/`로 보존, 컴포넌트 옆 CSS 13개 파일. `mobile.css` 6,389→1,661줄, `desktop.css` 2,361→544줄.
- `web → desktop` 이름 통일 완료(2026-09-04, `wp-05-desktop-naming`, PR #39~#42): `DesktopApp`·`desktop.html`·`vite.config.desktop.js`·`build:desktop`·`dist-desktop`. URL `/web`·`static/web`은 T-05 배포에서 결정.
- `DesktopApp.tsx` 분해 완료(2026-09-05, `wp-06-desktop-app-split`, PR #44~#50): 1,812 → 451줄, `app/desktop/{panels,hooks,lib}`에 영역 컴포넌트 9·훅 6·상수 6 파일. 로직 변경 0. 잔여 51줄(solo 포커스·dock 애니메이션·바깥 클릭 effect)은 사용자 결정으로 유지.
- API 중계 재연결 보강 완료(2026-09-05, PR #52, Fast Path): `ReconnectPolicy`·`WsConnect` + Bitget 무수신 점검. 실제 끊김 후 재연결 로그 확인은 미실행.
- 프로젝트가 지금 달성하려는 결과: 큰 파일 분해 나머지(`wp-07-large-files`) — DrawingToolbar(641) → useAutoPatterns(990) → OrderPage(911) → MarketChart(1,585) 순. 공용 파일은 Desktop·Mobile 양쪽 육안 확인이 merge 조건.
- 완료 기준: Milestone `large-files-split-done` (새 파일 400줄 이하, 원본 목표 줄 수, Gate 유지, 양 앱 확인).

## TODO

> 우선순위 순이다. 각 항목은 반드시 한 줄로 쓰고 완료하면 지운다.

1. `wp-07-d01-drawing-toolbar` (Desktop 전용, 기계적)
2. `wp-07-d02-auto-patterns` (순수 헬퍼 이동)

## Deferred

- Beta 배포(별도 wp 예정): 도메인 구입 여부와 DB 위치가 정해질 때까지 보류. 후보 구성은 OQ-20260903-04. jar 전환·`ops/deploy.sh` 교체·`static/web` 생성 bundle 처리(OQ-08)는 이때 함께

- Private Worklog 연결(`.ai-workflow.local`) — OQ-20260903-07 결정 후
- `labs/trading/worker/.env`·`ecosystem.config.cjs` 복사 — 워커를 다시 쓸 때(모의투자 Track)

## 활성 Work Package

- [refactor/wp-07-large-files](work/refactor/wp-07-large-files/PLAN.md) — d01부터

## 완료된 Work Package (링크만)

- [refactor/wp-01-rename-tpm](work/refactor/wp-01-rename-tpm/PLAN.md) — 2026-09-03, PR #10·#11
- [refactor/wp-02-beta-boundary](work/refactor/wp-02-beta-boundary/PLAN.md) — 2026-09-03, PR #14·#15·#16
- [refactor/wp-03-web-structure](work/refactor/wp-03-web-structure/PLAN.md) — 2026-09-03, PR #24~#30
- [refactor/wp-04-css-cleanup](work/refactor/wp-04-css-cleanup/PLAN.md) — 2026-09-04, PR #32~#37
- [refactor/wp-05-desktop-naming](work/refactor/wp-05-desktop-naming/PLAN.md) — 2026-09-04, PR #39~#42
- [refactor/wp-06-desktop-app-split](work/refactor/wp-06-desktop-app-split/PLAN.md) — 2026-09-05, PR #44~#50

## Blocker·주의

- `ops/verify`의 `verify-signals`(153 vs 143)·`verify-worker-harmonic-status`(253 vs 253 내용 불일치)는 원본에서 이어진 기존 baseline drift다. Gate 판정은 "원본과 같은 실패"를 통과로 본다. baseline `--update`는 별도 승인.
- `ops/check-secrets.sh` 파일명·비밀번호 규칙을 소스 코드 오탐 때문에 두 번 좁혔다(PR #4·#5). 가져오기 중 추가 오탐은 없었다.
- API 기본 기동(`dev`)은 Beta 모드다. 자동매매·Paper·Push·Admin API는 `JAVA_TOOL_OPTIONS="-Dspring.profiles.active=dev,trading"`으로만 등록된다(`docs/COMMANDS.md`).
- `labs/trading/web`은 `@web/*` alias로 `apps/web`을 참조하는 보존 코드다. 타입체크는 `apps/web/node_modules` symlink로 로컬에서만 한다.
- Bubot Mobile dev 서버는 `localhost:5175`를 팀 프로젝트 PetCare Vite와 공유한다. PetCare가 떠 있으면 LAN IP로만 열리는데, API CORS 허용 목록(`app.cors.allowed-origins`, 로컬 properties)에 LAN 주소가 없어 로그인이 403이 된다. PetCare를 끄고 `localhost:5175/mobile/`로 접속한다. Desktop dev는 `npm run dev:desktop`(`vite.config.desktop.js`), 정확히 `/web/`이 아닌 경로도 `desktop.html`로 리라이트된다.
- API의 거래소 중계(`CoinRealtimeWebSocketService`·`BinanceKlineRelayService`·Binance 티커 WS)는 끊긴 뒤 재연결에 실패하면 다시 시도하지 않는 약점이 있다(2026-09-04 로그: 포트 고갈·reconnecting 플래그 고착). Mobile은 모든 실시간 데이터가 이 중계에 의존해 통째로 멈춘다. PR #52에서 재연결 백오프·타임아웃·무수신 점검을 넣었다. 실제 끊김 후 재연결 로그(`재연결 예약(N회째)` → `연결 완료`)는 아직 확인 전.
- CSS 규칙은 쓰는 컴포넌트 옆 `.css`에 있다(D-20260904-01). 앱 `styles/`에는 토큰·reset·셸과 양 앱 공용 규칙만 있고, 두 셸에 같은 선택자 90개가 남아 있다(OQ-20260904-01). 새 규칙은 컴포넌트 옆 파일에 추가한다.
- 로컬 기동용 Git 밖 파일이 Bubot에 준비돼 있다: 루트 `.env`, `apps/web/.env`, `apps/api/src/main/resources/application*.properties`(MyBatis key `com.bubot`), `ops/back-end.sh`·`worker.sh`. 원본 AutoTrade와 같은 DB·계정을 가리킨다.

## 읽기 안내

- 구현·버그 수정·테스트 시 → `docs/COMMANDS.md` · `docs/PROJECT.md`
- Git·PR 작업 시 → `docs/GIT-WORKFLOW.md`
- Planning 작업 시 → `work-status/planning/COMMON.md` · `work-status/planning/PROJECT-OVERLAY.md`와 활성 PLAN
- 결정·미결 확인 시 → `work-status/DECISIONS.md` · `work-status/OPEN-QUESTIONS.md`
- 문서 역할·기록 경계 → `docs/DOCUMENTATION.md`
