---
schema: ai-workflow/work-package@1
id: wp-01-rename-tpm
title: TPM 이름을 Bubot으로 rename
workstream: refactor
state: completed
updated: 2026-09-03
depends_on: []
supersedes: []
outcome: "코드·설정·스크립트에서 TPM 팀 프로젝트 이름(com.tj.app, TpmApplication, tpmApi, tpm_token, tpm- ticket)이 사라지고 Bubot 이름으로 동작이 그대로 유지된다."
acceptance:
  - "AC-001: 저장소 추적 파일에서 `com.tj.app`·`com/tj/app`·`TpmApplication`·`tpmApi`·`tpm_token`·`tpm-` 식별자 참조가 0이다 (역사 기록 문서의 서술은 제외)."
  - "AC-002: 기능 변경 없이 API `compileJava`·`bootWar`와 Web tests 22·build 2종이 기준선과 같은 결과를 낸다."
  - "AC-003: 로컬 기동 시 API가 `com.bubot.BubotApplication`으로 뜨고 Web 로그인·시세 조회가 동작한다."
deliveries:
  - id: wp-01-d01-api
    title: "API 패키지 com.tj.app → com.bubot, TpmApplication → BubotApplication"
    kind: git
    state: completed
    repository: .
    depends_on: []
    branch: refactor/rename-api-package
    pull_requests: [10]
    evidence:
      - kind: command
        locator: "git diff -M: 77 rename + SKILL.md 1 수정, 변경 줄은 package·import·클래스명·namespace뿐; git grep com.tj.app|TpmApplication -- apps .claude = 0; ./gradlew compileJava bootWar 통과, war Start-Class com.bubot.BubotApplication"
        revision: working-tree
        observed_at: 2026-09-03
  - id: wp-01-d02-web
    title: "Web tpmApi·tpm_token·tpm- ticket rename"
    kind: git
    state: completed
    repository: .
    depends_on: [wp-01-d01-api]
    branch: refactor/rename-web-tpm
    pull_requests: [11]
    evidence:
      - kind: command
        locator: "tpmApi.ts → marketApi.ts R100, importer 13개 경로만 변경, tpm_token → bubot_token, ticket tpm- → bubot-; npm test 22 passed, build·build:web 통과; git grep 식별자 잔여 0 (web.css·WebApp.tsx 주석 7줄과 apps/api static/web 생성 bundle 제외)"
        revision: working-tree
        observed_at: 2026-09-03
milestones:
  - id: tpm-name-free
    title: "TPM 이름 0"
    state: passed
    depends_on: [wp-01-d02-web]
    acceptance:
      - "GATE-AC-001: `git grep -iE 'com\\.tj\\.app|com/tj/app|TpmApplication|tpmApi|tpm_token|tpm-' -- apps labs shared ops .claude`가 0줄이다."
      - "GATE-AC-002: 로컬에서 API·Web을 띄워 로그인과 시세 화면을 확인했다."
    unlocks: []
    evidence:
      - kind: command
        locator: "git grep -iE 'com\\.tj\\.app|com/tj/app|TpmApplication|tpmApi|tpm_token|tpm-' -- apps labs shared ops .claude (static/web 생성 bundle 제외) = 0"
        revision: de2132e6
        observed_at: 2026-09-03
      - kind: browser
        locator: "로컬 기동: API 시작 클래스 com.bubot.BubotApplication, 시세 200·auth 401; Desktop 차트·호가 렌더링; Mobile 로그인 화면 → 사용자 로그인 후 정상 확인(사용자 보고). 로컬 application.properties MyBatis key 2개를 com.bubot으로 변경"
        revision: de2132e6
        observed_at: 2026-09-03
extensions: {}
---

# TPM 이름을 Bubot으로 rename

## 범위

포함:

- Java 패키지 `com.tj.app` → `com.bubot` (main 76개 + test 1개 = 77개 파일 이동과 `package`·`import` 선언 수정)
- `TpmApplication` → `BubotApplication`, `TpmApplicationTests` → `BubotApplicationTests`, `ServletInitializer`의 참조
- MyBatis mapper XML 3개의 `namespace` (`BotApiKeyMapper`·`MemberMapper`·`PushSubscriptionMapper`)
- Web: `src/api/tpmApi.ts` → `src/api/marketApi.ts`와 importer 13개, `authApi.ts`의 `TOKEN_KEY = 'tpm_token'` → `'bubot_token'`, `krwRealtime.ts`의 WebSocket ticket 접두어 `tpm-` → `bubot-`
- `.claude/skills/서버/SKILL.md`의 `pkill -f "com.tj.app.TpmApplication"` 문자열
- `docs/architecture/mobile-structure-map.md`의 `tpmApi.ts` 경로 표기 2곳

제외:

- 기능·로직 변경. 이 Work Package는 이름과 경로만 바꾼다.
- `web.css`·`web-mockup.html`·`WebApp.tsx` 주석의 "tpm 스타일" 디자인 참조 서술. 코드 식별자가 아니며 3번 코드 정리에서 다룬다.
- DECISIONS·ROADMAP·CURRENT의 역사 서술(D-20260902-01 등).
- `apps/api/src/main/resources/static/web/assets/web-*.js`: 과거 Desktop build 산출물이 Git에 추적돼 옛 `tpm_token`·`tpm-` 문자열을
  담고 있다. 생성물의 Git 소유 여부는 OQ-20260903-08로 분리하고, 재빌드·교체는 배포 Track에서 다룬다.
- Git 밖 로컬 파일(`application.properties`): `mybatis.mapper-locations`·`mybatis.type-aliases-package` 두 key가 `com.tj.app`을
  참조한다(2026-09-03 원본 로컬 파일 확인, 값은 미열람). d01 merge 후 로컬 기동 전에 사용자가 `com/bubot`·`com.bubot`으로
  수정해야 하며, 수정 전에는 mapper를 못 찾아 기동이 실패한다. `.env`는 패키지와 무관하다.

## 실행 순서

1. `wp-01-d01-api`: `git mv apps/api/src/main/java/com/tj/app apps/api/src/main/java/com/bubot`(test도 동일) → `package com.tj.app` / `import com.tj.app` 문자열 치환 → 클래스 rename → mapper namespace → SKILL.md. Gate: `./gradlew compileJava bootWar -x test`, `git grep 'com.tj.app' -- apps` 0.
2. `wp-01-d02-web`: `git mv tpmApi.ts marketApi.ts` → importer 13개 경로 수정 → `tpm_token`·`tpm-` 치환 → mobile-structure-map 표기. Gate: `npm test`(22), `npm run build`, `build:web`, `git grep -i 'tpmApi\|tpm_token\|tpm-' -- apps/web/src` 0.
3. Milestone `tpm-name-free`: 전체 grep 0 확인, 로컬 기동(`/서버`)으로 로그인·시세 화면 확인. `tpm_token` 변경으로 기존 브라우저 세션은 로그아웃된다(Beta 배포 전이라 영향 없음).

## Delivery Notes

### wp-01-d01-api

- 주요 Task: 위 1번. Spring Boot는 `@SpringBootApplication` 클래스의 패키지를 기준으로 스캔하므로 한 PR에서 전부 옮긴다. `sourceSets`가 `src/main/java`도 resources로 포함하므로 mapper XML은 Java 파일과 같이 이동한다.
- 추가 Gate: `git diff -M --stat`에서 77개가 rename으로 잡히고 내용 변경은 `package`·`import`·클래스명 줄뿐인지 확인.
- Blocker·재개 조건: merge 자체는 막히지 않는다. 로컬 기동(GATE-AC-002)은 사용자가 로컬 `application.properties`의
  MyBatis key 2개를 `com.bubot` 기준으로 고친 뒤에만 가능하다.

### wp-01-d02-web

- 주요 Task: 위 2번. `marketApi.ts`라는 새 이름은 이 파일이 시세·캔들·호가 프록시 호출 래퍼이기 때문이다. 다른 이름을 원하면 시작 전에 정한다.
- 추가 Gate: `git grep -i tpm -- apps/web/src`에 남는 것이 주석 서술 3줄(`WebApp.tsx` 1, `web.css` 6)뿐인지 확인.
- Blocker·재개 조건: d01 merge 후 시작.

## Milestone Notes

- Frontmatter의 Milestone `acceptance·evidence`가 판정 정본이다.
- 로컬 기동 확인은 `apps/api`·`apps/web`에 로컬 `.env`·properties가 있어야 한다. 없으면 GATE-AC-002는 `blocked`로 두고 사용자가 로컬 파일을 둔 뒤 재검증한다.

## 관련 정본

- `work-status/DECISIONS.md` D-20260903-01 (Bubot 이름·rename 대상)
- `work-status/ROADMAP.md` T-02
- `docs/COMMANDS.md`

## 운영 메모

- 일일 과정과 Tool Output은 PLAN이 아니라 commit·PR 본문에 기록한다.
- 정식 identity는 `refactor/wp-01-rename-tpm`이다. `NN`은 고정 번호이며 재번호하지 않는다.
