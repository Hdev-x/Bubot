---
schema: ai-workflow/work-package@1
id: wp-02-beta-boundary
title: Beta 제외 기능을 실행 경로에서 분리
workstream: refactor
state: active
updated: 2026-09-03
depends_on: [wp-01-rename-tpm]
supersedes: []
outcome: "Beta 번들·API에는 시세·차트·호가·관심종목·로그인·거래소 계좌 Read-only 조회만 남고, 자동매매·Paper·Backtest·Admin·Push 코드는 삭제 없이 labs 또는 비활성 프로필로 보존된다."
acceptance:
  - "AC-001: Web Beta 번들(dist·dist-web)에 /api/paper·/api/admin·/api/bot·backtest-runs·trade-configs 호출 문자열이 없다."
  - "AC-002: apps/web/src가 labs/를 import하지 않는다. labs/trading/web은 shared와 apps/web(@web/* 경로 alias)을 import할 수 있다 — 의존 방향은 labs → apps/web 단방향 (2026-09-03 d02에서 조정: 보존 코드가 authApi·types/bot·CurrencyContext 등 Beta 공용 모듈에 의존하므로 복제 대신 단방향 참조 허용)."
  - "AC-003: Beta 프로필(spring.profiles.active=beta)로 기동한 API에서 제외 컨트롤러의 endpoint가 404이고, Beta 컨트롤러(auth·main-trade·spot-trade·positions·api-keys·spot-manual-cost·/coin/api/**)는 그대로 동작한다."
  - "AC-004: 기준선 Gate(Web tests·build 2종, API compile·bootWar, ops/verify 6종)가 원본과 같은 결과를 낸다."
  - "AC-005: 로컬 기동에서 Mobile·Desktop의 Market·Chart·Watchlist·Assets(Read-only)·Login이 동작하고 Strategy 탭은 준비 화면을 보여준다."
deliveries:
  - id: wp-02-d01-web-decouple
    title: "Beta entry의 자동매매 정적 import 끊기와 준비 화면"
    kind: git
    state: active
    repository: .
    depends_on: []
    branch: refactor/web-decouple-trading
    pull_requests: []
    evidence:
      - kind: command
        locator: "npm test 22 passed, build·build:web 통과; dist·dist-web에 /api/paper·/api/admin·/api/bot·backtest-runs·trade-configs 문자열 0; Beta 파일→labs 후보 import 0"
        revision: working-tree
        observed_at: 2026-09-03
      - kind: browser
        locator: "Desktop 5174 새 탭: React 오류 0(ws-coin 빈 토큰만), 차트·호가·커뮤니티 패널 렌더링, 전략 섹션은 로그인 게이트 뒤 준비 화면"
        revision: working-tree
        observed_at: 2026-09-03
  - id: wp-02-d02-web-labs
    title: "Web 자동매매 묶음을 labs/trading/web으로 이동"
    kind: git
    state: active
    repository: .
    depends_on: [wp-02-d01-web-decouple]
    branch: refactor/web-move-trading-to-labs
    pull_requests: []
    evidence:
      - kind: parity-check
        locator: "38개 git mv rename(내용 변경은 import 경로 줄뿐), ApiKeyManager는 config/accountTargets 분리로 Beta 유지; git grep 'labs/' -- apps/web/src = 0"
        revision: working-tree
        observed_at: 2026-09-03
      - kind: command
        locator: "apps/web npm test 22·build·build:web 통과; labs/trading/web tsc --noEmit 통과(@web alias, apps/web node_modules symlink)"
        revision: working-tree
        observed_at: 2026-09-03
  - id: wp-02-d03-api-profile
    title: "API 제외 컨트롤러·서비스를 trading 프로필로 묶고 beta 프로필 기본화"
    kind: git
    state: planned
    repository: .
    depends_on: []
    branch: refactor/api-trading-profile
    pull_requests: []
    evidence: []
milestones:
  - id: beta-boundary-locked
    title: "Beta 경계 고정"
    state: pending
    depends_on: [wp-02-d02-web-labs, wp-02-d03-api-profile]
    acceptance:
      - "GATE-AC-001: AC-001~AC-004 자동 검사 통과."
      - "GATE-AC-002: AC-005 로컬 기동 확인 (beta 프로필 API + Web 2종)."
    unlocks: []
    evidence: []
extensions: {}
---

# Beta 제외 기능을 실행 경로에서 분리

## 범위

포함:

- Web: 자동매매·Paper·Backtest·Admin 묶음(32개 파일, 8,724줄)을 Beta entry에서 끊고 `labs/trading/web/`으로 이동
- API: 제외 컨트롤러·서비스에 `@Profile("trading")`을 붙이고, `beta` 프로필을 기본 기동 프로필로 둔다. 코드 이동·삭제 없음
- Push·Admin은 자동매매에 붙은 기능으로 보고 함께 제외한다 (사용자 결정 2026-09-03)

제외:

- 코드 삭제. 모든 제외 코드는 `labs` 또는 프로필 뒤에 보존한다.
- Gradle 멀티 모듈 분리. 모의투자 Track에서 다시 판단한다.
- `labs/trading/worker`(봇 런타임) 변경. 이미 분리돼 있다.
- CSS·큰 파일 분해 등 코드 품질 정리(wp-03 이후).
- DB 테이블·컬럼 변경.

## 경계표

| 분류 | 대상 | 처리 |
|---|---|---|
| Beta 유지 (Web) | `pages/{CoinList,CoinChart,Order,Assets,Login,Placeholder}`, `MarketChart`·chart-hooks·indicators·drawing·coin-list·trade 컴포넌트, `api/{marketApi,authApi,mainTradeApi,spotTradeApi,walletApi,apiKeysApi,*Realtime,*Symbols,*Ticker,exchangeRate,chartPolicy}`, `web/WebApp`·`WebLogin`·`WebSignup`·`web/components/{WebMarketPanel,WebFavoritesPanel,WebWatchlist,WebDrawingToolbar,WebRsiSettings,marketShared,snapFloat}` | 그대로 |
| Beta 유지 (Web, 수정) | `App.tsx`(StrategyPage import → 준비 화면), `WebApp.tsx`(PaperStatusPanel·WebPaperOrder·WebMonitoringPanel·usePaperTrade import 제거), `AssetsPage`·`CoinListPage`(`getWorkerStatus` 제거 또는 stub), `AlertSheet`(`adminApi` 하모닉 알림·push 제거), `ProfileMenu`(push 구독 제거), `constants/strategyConstants`(`backtestEngine` 의존 → `shared/strategy-schema` 기본값 또는 labs로 이동) | d01에서 정적 import 끊기 |
| labs로 이동 (Web) | `pages/{StrategyPage,LivePage}`, `components/{strategy,live,settings}/*`, `PaperStatusPanel`, `utils/{backtestEngine,backtestReport}`, `api/{paperApi,adminApi,botApi,botStatus,backtestRunApi,tradeConfigApi,userTradeApi}`, `web/components/{WebMonitoringPanel,WebPaperOrder}`, `hooks/usePaperTrade`, `utils/push`, `types/bot`(사용처 확인 후) | d02에서 `labs/trading/web/src/` 상대 구조 유지 이동 |
| Beta 유지 (API) | `member/{AuthController,BotApiKeyController,BotApiKeyService,MemberService*}`, `trade/{MainTradeController,SpotTradeController,PositionController,SpotManualCostController,BitgetClient}`, `market/coin/*`, `common/security/*`, `common/config/{WebSocketConfig,FileMappingConfig,SystemFlagService,DdlAutoRunner}` | 그대로 |
| trading 프로필 (API) | `backtest/*`, `bot/*`(BotProxy·WebSocketProxy), `push/*`, `trade/{AdminController,InternalTradeController,InternalWorkerController,TradeConfigController,TradeController,TradeConfigService,TradeMapper,WorkerStatusHolder}`, `trade/paper/*`, `member/InternalBotCredentialController` | d03에서 `@Profile("trading")`. 클래스 단위, 필요 시 `@Configuration`으로 묶음 |
| 별도 판정 (API) | `SecurityConfig`의 `/api/bot/**`·`/api/internal/**`·`/ws-stock` 규칙, `SystemFlagService`(kill switch), `WorkerStatusHolder`를 Beta 컨트롤러가 참조하는지 | d03 시작 시 import 추적 후 결정 |

## 실행 순서

1. `wp-02-d01-web-decouple`: Beta entry(`App.tsx`·`WebApp.tsx`·`AssetsPage`·`CoinListPage`·`AlertSheet`·`ProfileMenu`·`strategyConstants`)에서
   labs 후보로의 정적 import를 제거하고 Strategy 탭에 공용 준비 화면(`StrategyComingSoon`)을 둔다. 코드는 아직 옮기지 않는다.
   Gate: tests 22·build 2종, 생성 번들 grep(`/api/paper|/api/admin|/api/bot|backtest-runs|trade-configs`) 0.
2. `wp-02-d02-web-labs`: 후보 32개 파일을 `git mv`로 `labs/trading/web/src/` 아래 같은 상대 경로로 옮기고 내부 상대 import(`shared` 깊이)를
   고친다. `labs/trading/web`에 `package.json`·`tsconfig` 최소 구성을 두어 `tsc --noEmit`이 통과하게 한다.
   Gate: hash 대조(이동 파일 내용 동일, import 줄만 변경), Web tests·build, `git grep 'labs/' -- apps/web/src` 0.
3. `wp-02-d03-api-profile`: 제외 클래스에 `@Profile("trading")`, `application.properties`(Git 밖)의 `spring.profiles.active`는 사용자가
   `beta`로 설정. `SecurityConfig` 규칙 중 trading 전용 경로는 남겨도 무해하므로 유지.
   Gate: `compileJava`·`bootWar`, beta 프로필 기동 후 제외 endpoint 404·유지 endpoint 200/401 curl 검사, trading 프로필 기동 시 전부 복원.
4. Milestone: 로컬 기동으로 Mobile·Desktop 핵심 화면 확인.

## Delivery Notes

### wp-02-d01-web-decouple

- 주요 Task: 위 1번. `AssetsPage`·`CoinListPage`의 `getWorkerStatus`는 "봇 상태" 표시라 Beta에서는 제거. `ProfileMenu`의 push 구독 항목 제거.
- 시작 시 확인 결과(2026-09-03): `AlertSheet`는 `LivePage`만 쓰므로 Beta entry가 아니라 d02 이동 대상으로 재분류. `strategyConstants`·
  `hooks/useBotStreams`·`config/bots`·`utils/botAggregates`·`api/botStatus`도 labs 후보만 쓰므로 d02 이동. `types/bot`은 `MarketChart`·
  `useAutoPatterns`·`OrderPage`가 타입으로 쓰므로 Beta에 유지. Community 패널은 이 WP 범위 밖이라 건드리지 않았다(`config/features.ts`의
  `community` 플래그는 미사용 선언).
- 참고 branch의 `WebApp.tsx`를 그대로 가져오면 `createRoot` 중복·`removeChild` 오류가 나서, 현재 파일에서 paper·monitoring 결합(85줄)만 직접
  제거했다. `App.tsx`·`AssetsPage`·`CoinListPage`는 참고 branch 결과를 채택하되 헤더 로고 제거(브랜드 범위)는 되돌렸다.
- 추가 Gate: 원본 저장소 `refactor/bullum-beta` 브랜치의 어제 D03 결과(`StrategyComingSoon`, 35개 이동 목록)와 대조해 누락 확인. cherry-pick은 하지 않는다.
- Blocker·재개 조건: 없음.

### wp-02-d02-web-labs

- 주요 Task: 위 2번. `labs/trading/web`은 독립 실행 대상이 아니라 보존·타입체크 대상이다. Vite 진입점은 만들지 않는다.
- 실행 결과(2026-09-03): d01 재분류분을 합쳐 38개 파일(9,3xx줄) 이동. `settings/ApiKeyManager`는 Beta 유지하고 그것이 쓰던 `SUB_ACCOUNT_NAMES`를
  `config/accountTargets.ts`로 분리, `config/bots.ts`는 이동. 이동 파일의 Beta 모듈 참조는 `@web/*`(tsconfig paths)로, `shared`는 깊이 조정.
  `apps/web/tsconfig.app.json`의 `include: ["src"]`는 labs를 잡지 않는다. 로컬 타입체크는 `apps/web/node_modules` symlink로 수행하며 CI에는 넣지 않았다.
- 추가 Gate: `apps/web` `tsconfig`의 `include`가 `labs`를 잡지 않는지 확인.
- Blocker·재개 조건: d01 merge 후.

### wp-02-d03-api-profile

- 주요 Task: 위 3번. `@Profile`은 `@RestController`·`@Service`·`@Configuration`·`@Component` 클래스에 붙인다. MyBatis `@Mapper` 인터페이스는
  프로필 대상이 아니므로 사용처가 사라지면 자연히 미사용이 된다.
- 추가 Gate: `spring.profiles.active=beta`와 `trading` 두 번 기동해 endpoint 표를 curl로 대조.
- Blocker·재개 조건: 로컬 `application.properties`에 `spring.profiles.active=beta` 추가는 사용자 작업(Git 밖).

## Milestone Notes

- Frontmatter의 Milestone `acceptance·evidence`가 판정 정본이다.
- Beta에서 사라지는 UI: Strategy·Live 화면, Paper 주문 패널, 모니터링 패널, 봇 상태 배지, 하모닉 알림·Push 구독, Assets의 API Key 관리(`settings/ApiKeyManager`)는
  Read-only 조회에 필요하므로 **유지**한다 (경계표의 `settings/*` 중 예외).

## 관련 정본

- `work-status/DECISIONS.md` D-20260901-01(Beta 범위)·D-20260901-03(labs 보존)
- `work-status/ROADMAP.md` T-03
- 원본 저장소 `Hdev-x/Bullum` `refactor/bullum-beta`의 `docs/work/refactor/beta-runtime-extraction/PLAN.md` 경계표 (참고용)

## 운영 메모

- 과정은 commit·PR 본문에 기록한다. 정식 identity는 `refactor/wp-02-beta-boundary`.
