# 폴더 구조

2026-09-05 기준 전체 트리와 역할이다. 요약은 루트 `README.md`, 경계 규칙은 `docs/PROJECT.md`가 소유한다.

```text
Bubot/
├── apps/
│   ├── api/                       Spring Boot 3.5 · MyBatis · PostgreSQL
│   │   ├── build.gradle           war 패키징 (jar 전환 예정)
│   │   └── src/main/java/com/bubot/
│   │       ├── BubotApplication.java
│   │       ├── common/security/   JWT 발급·검증, Security 설정
│   │       ├── common/config/     WebSocket(STOMP)·정적 라우팅·DDL 초기화
│   │       ├── member/            로그인·회원, 거래소 API Key 등록
│   │       ├── market/coin/       Binance·Bitget·Bithumb·Upbit·CoinGecko 시세 프록시, 실시간 캔들·호가 중계
│   │       ├── trade/             거래소 계좌·포지션·현물 Read-only 조회 (일부는 trading 프로필)
│   │       ├── trade/paper/       모의투자 API (trading 프로필)
│   │       ├── backtest/  bot/  push/   백테스트 기록·봇 프록시·푸시 (trading 프로필)
│   │       └── */*Mapper.xml      MyBatis 매퍼
│   └── web/                       React 19 · TypeScript · Vite · Vitest
│       ├── vite.config.js         Mobile 진입점 (/mobile, PWA)
│       ├── vite.config.desktop.js Desktop 진입점 (desktop.html, URL /web)
│       └── src/                   계층 우선: app → chart/hooks → api → shared
│           ├── app/
│           │   ├── mobile/        main·App, pages/ 5(+css), components/(sheets·coin-list·trade, 각 폴더 css), hooks/(useMobileOrderbook), styles/mobile.css
│           │   └── desktop/       main·DesktopApp(조립, 451줄)·DesktopLogin·DesktopSignup(+css), styles/desktop.css
│           │       ├── panels/    영역 컴포넌트 — DesktopHeader·IconRail·Sidebar·InvestSection·SymbolHeader·ChartToolbar·ChartStage·OrderbookPanel·RightPanel + Market·Watchlist·Favorites·RsiSettings (+panels.css), drawing/(ColorPicker·DrawingFloatBar·DrawingSettings)
│           │       ├── hooks/     Desktop 전용 상태·데이터 훅 — useDesktopCandles·useOrderbookSnapshot·useHeaderSnapshot·useDrawingState·useIndicatorState·useChartViewState
│           │       └── lib/       상수·순수 함수 — timeframes·orderbook·format·drawTools·indicatorDefaults·sections
│           ├── chart/             MarketChart(1,332), overlays/ hooks/(캔들·지표·자동패턴·harmonicShapes + MarketChart 전용 useRsiPane·useDrawingMagnet·useValueOverlay·useRankLines) indicators/ settings/ drawing/ analysis/(루트 shared 재수출 + swingMarkers)
│           ├── hooks/             market/(시세·호가·정밀도) account/(계좌·관심) ui/(persist·scroll·poll)
│           ├── api/               client.ts(fetch·토큰), server/(Spring 컨트롤러 1:1), exchange/(bitget·binance·krw 직접 호출)
│           ├── shared/            types/ constants/ contexts/ utils/(포맷터·계산 + tests)
│           └── config/  assets/   계좌 대상·차트 정책, 정적 자산
├── shared/                        하모닉·SMC·엘리어트/AB=CD·피벗 계산, 전략 설정 스키마 (순수 TS, 의존 없음)
├── labs/
│   └── trading/
│       ├── worker/                봇 매매·모니터링 워커 (Node) — Beta 비활성
│       │   └── src/               bot.ts, unified-worker.ts, lib/(엔진·거래소 API·실행기)
│       └── web/                   Beta에서 분리한 자동매매·Paper·Backtest UI 보존본 (진입점 없음, 타입체크만)
├── ops/
│   ├── back-end.sh  front-end.sh  worker.sh   로컬 기동 (일부는 secret 포함, gitignore)
│   ├── deploy.sh                  war 배포 스크립트 (EC2 Tomcat 기준, 교체 예정)
│   ├── check-secrets.sh           pre-commit secret 검사
│   └── verify/                    회귀 검사 6종과 baseline fixtures
├── docs/                          PROJECT · COMMANDS · GIT-WORKFLOW · DOCUMENTATION · AI-STYLE, architecture/ sql/ design/
├── work-status/                   CURRENT · DECISIONS · OPEN-QUESTIONS · ROADMAP, planning/, work/<ws>/<wp>/PLAN.md
├── .github/                       CI(ci.yml), PR 템플릿
├── .githooks/                     pre-commit(secret), pre-push(main 보호)
└── AGENTS.md  CLAUDE.md           AI 작업 규칙
```

## `apps/web/src/app`이 둘로 나뉜 이유

Mobile(탭 앱)과 Desktop(패널 배치)은 화면이 다르지만 차트·훅·API 68개 파일을 같은 동작으로 쓴다. 정석대로면 `apps/web-mobile`·`apps/web-desktop`과 `packages/{chart,hooks,api}`로 쪼개지만,
혼자 관리하는 Beta에서는 워크스페이스·의존성 중복·CI 2배·배포 2벌의 비용이 이득보다 크다. 그래서 Vite 프로젝트 하나에 진입점 둘을 두고 `app/{mobile,desktop}`로 앱 전용 코드만 가르고
나머지는 `src/` 바로 아래 계층(`chart/`·`hooks/`·`api/`·`shared/`)에 한 벌로 둔다. 나중에 쪼갤 때는 이 계층 폴더가 그대로 `packages/`가 된다. CSS는 쓰는 컴포넌트 옆에 둔다(D-20260904-01).

## 의존 방향

- `apps/web → shared`, `labs/trading/worker → shared`, `ops/verify → labs/trading/worker · shared`
- `labs/trading/web → apps/web`(`@web/*` alias) · `shared` — 보존 코드가 Beta 공용 모듈을 참조하는 단방향
- `apps`는 `labs`를 import하지 않는다 (CI 번들 검사·grep으로 확인)
- `apps/web/src` 내부는 `app → chart/hooks → api → shared` 방향만 허용한다. 루트 `shared/` 계산 엔진은 `chart/analysis/`를 통해서만 가져온다. 앱 전역 CSS는 `app/*/styles/`, 공용 컴포넌트 CSS는 컴포넌트 옆에 둔다
- API의 `backtest`·`bot`·`push`·`trade/paper`·Admin·Internal·TradeConfig·Trade bean은 `@Profile("trading")`
