# 폴더 구조

2026-09-03 기준 전체 트리와 역할이다. 요약은 루트 `README.md`, 경계 규칙은 `docs/PROJECT.md`가 소유한다.

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

## 의존 방향

- `apps/web → shared`, `labs/trading/worker → shared`, `ops/verify → labs/trading/worker · shared`
- `labs/trading/web → apps/web`(`@web/*` alias) · `shared` — 보존 코드가 Beta 공용 모듈을 참조하는 단방향
- `apps`는 `labs`를 import하지 않는다 (CI 번들 검사·grep으로 확인)
- API의 `backtest`·`bot`·`push`·`trade/paper`·Admin·Internal·TradeConfig·Trade bean은 `@Profile("trading")`
