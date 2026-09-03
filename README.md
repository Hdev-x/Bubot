# Bubot

암호화폐 시세·차트·호가를 보고 거래소 계좌를 Read-only로 확인하는 웹 앱이다. Desktop 웹과 Mobile(PWA) 두 화면을 하나의
React 앱으로 제공하고, Spring Boot API가 거래소 시세를 중계하며 계좌를 조회한다. 봇 매매 엔진(하모닉·SMC·ABCD 패턴)은
`labs`에 보존해 두고 이후 모의투자로 노출할 예정이다.

> Portfolio Beta 단계다. 자동매매·Paper Trading·Backtest·Push·관리자 기능은 코드로 존재하지만 Beta 실행 경로에서 분리돼 있다.

## 화면

![Desktop — 차트·호가·커뮤니티·실시간 종목](docs/images/desktop.png)

| 화면 | 경로 | 내용 |
|---|---|---|
| Desktop | `/web` | 차트(TradingView lightweight-charts)·호가·종목 목록·관심종목·내 투자 사이드바 |
| Mobile | `/mobile` | 마켓·차트·거래·자산 탭, PWA 설치 |

시세는 Binance·Bitget·Bithumb·Upbit·CoinGecko를 서버가 프록시하고, 실시간 캔들·호가는 서버가 거래소 WebSocket을 받아 STOMP로 중계한다.

## 구조

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
│       ├── vite.config.web.js     Desktop 진입점 (/web)
│       └── src/
│           ├── main.tsx  App.tsx  Mobile 앱 (탭 라우팅)
│           ├── web/               Desktop 앱 — WebApp.tsx, 로그인·가입, 사이드바 패널
│           ├── pages/             Mobile 페이지 — 마켓·차트·거래·자산·로그인
│           ├── components/        차트(MarketChart)·지표·드로잉·호가·시트 UI
│           │   ├── chart-hooks/  indicators/  coin-list/  trade/  settings/
│           ├── drawing/           차트 드로잉 도구
│           ├── hooks/             실시간 시세·호가·계좌 조회 훅
│           ├── api/               서버 호출 래퍼 (marketApi·authApi·mainTradeApi·*Realtime …)
│           ├── contexts/  config/  constants/  types/  utils/
│           └── styles.css  web/web.css
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

의존 방향: `apps/web → shared`, `labs → shared`, `labs/trading/web → apps/web`(alias). `apps`는 `labs`를 import하지 않는다.
API의 자동매매·Paper·Push·Admin bean은 `@Profile("trading")`이라 기본 기동에서는 등록되지 않는다.

## 실행

요구: Node 22, Java 21, PostgreSQL. 로컬 설정 파일(`.env`, `apps/web/.env`, `apps/api/src/main/resources/application*.properties`)은
Git에 포함되지 않는다. 키 이름은 `apps/web/.env.example`을 참고한다.

```bash
# API (8081)
cd apps/api && ./gradlew bootRun

# Web — Mobile 5175, Desktop 5174
cd apps/web && npm ci && npm run dev        # Mobile
cd apps/web && npm run dev:web              # Desktop
```

검증 명령과 프로필 옵션은 [docs/COMMANDS.md](docs/COMMANDS.md)에 있다.

```bash
cd apps/web && npm test && npm run build && npm run build:web
cd apps/api && ./gradlew compileJava bootWar -x test
```

## 개발 규칙

- Git: GitHub Flow(`main` + 작업 브랜치), Squash and merge, 태그 기반 릴리즈 — [docs/GIT-WORKFLOW.md](docs/GIT-WORKFLOW.md)
- CI: PR과 `main` push에서 Web test·build 2종, API compile — [.github/workflows/ci.yml](.github/workflows/ci.yml)
- commit 전 `ops/check-secrets.sh`가 staged 파일의 secret 패턴을 검사한다 (`.githooks/pre-commit`, `git config core.hooksPath .githooks`)
- 현재 상태와 다음 할 일: [work-status/CURRENT.md](work-status/CURRENT.md) · 결정: [work-status/DECISIONS.md](work-status/DECISIONS.md)

## 기술

Java 21 · Spring Boot 3.5 · Spring Security(JWT) · MyBatis · PostgreSQL · WebSocket/STOMP ·
React 19 · TypeScript 6 · Vite 8 · Vitest · lightweight-charts 5 · Node 22

## 출처

팀 프로젝트(TPM, Spring MVC·JSP)에서 시작해 개인 프로젝트로 재구성했다. JSP 기반 잔해는 제거했고, 이 저장소는 정리된 코드에서
이력을 새로 시작했다. 연구·백테스트 자산은 별도 private 저장소에 보존한다.
