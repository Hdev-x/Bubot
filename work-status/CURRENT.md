# 현재 상태

- 마지막 갱신: 2026-09-03 (wp-02 완료)

> 이 문서는 다음 세션을 위한 상태판이다. 이력을 쌓지 않고 덮어쓴다.
> Branch·Commit·작업 트리는 Git에서, 완료 작업의 상세·증거는 PLAN과 Git History에서 확인한다.
>
> 상태별 자리: 결정 안 됨 → `OPEN-QUESTIONS.md` · 승인·시기 대기 → `Deferred` ·
> 막힘 → `Blocker·주의` · 결정됐고 할 것 → `TODO` · 완료 → 각 PLAN과 Git.

## 현재 목표

- 기준선 Track 완료(2026-09-03, PR #3~#7): `shared`·`apps/api`·`apps/web`·`labs/trading/worker`·`ops`가 원본 `develop`과 blob hash 동일하게 들어왔고, Web tests 22·build 2종·API bootWar·`ops/verify` 6종이 원본과 같은 결과다.
- 프로젝트가 지금 달성하려는 결과: 배포 전 품질 정리 — 루트 README, Web lint 정리와 CI lint, API test 자체 완결과 CI test, GitHub Ruleset.
- 완료 기준: CI가 lint·test까지 실제로 검사하고 `main`이 Ruleset으로 보호된다.

## TODO

> 우선순위 순이다. 각 항목은 반드시 한 줄로 쓰고 완료하면 지운다.

1. Web lint 오류 정리(`scripts/` 미사용 변수·`any`) 후 CI에 `npm run lint` 추가 (OQ-03)
2. API `contextLoads`를 H2·테스트 secret으로 자체 완결시키고 CI에 `./gradlew test` 추가 (OQ-02)
3. GitHub Ruleset: `main` PR 필수·force push 금지·required check (OQ-01)

## Deferred

- Beta 배포(`wp-03`): 도메인 구입 여부와 DB 위치가 정해질 때까지 보류. 후보 구성은 OQ-20260903-04. jar 전환·`ops/deploy.sh` 교체·`static/web` 생성 bundle 처리(OQ-08)는 이때 함께

- Private Worklog 연결(`.ai-workflow.local`) — OQ-20260903-07 결정 후
- `labs/trading/worker/.env`·`ecosystem.config.cjs` 복사 — 워커를 다시 쓸 때(모의투자 Track)

## 활성 Work Package

- 없음. `wp-03`(배포) PLAN 작성 대기.

## 완료된 Work Package (링크만)

- [refactor/wp-01-rename-tpm](work/refactor/wp-01-rename-tpm/PLAN.md) — 2026-09-03, PR #10·#11
- [refactor/wp-02-beta-boundary](work/refactor/wp-02-beta-boundary/PLAN.md) — 2026-09-03, PR #14·#15·#16

## Blocker·주의

- `ops/verify`의 `verify-signals`(153 vs 143)·`verify-worker-harmonic-status`(253 vs 253 내용 불일치)는 원본에서 이어진 기존 baseline drift다. Gate 판정은 "원본과 같은 실패"를 통과로 본다. baseline `--update`는 별도 승인.
- `ops/check-secrets.sh` 파일명·비밀번호 규칙을 소스 코드 오탐 때문에 두 번 좁혔다(PR #4·#5). 가져오기 중 추가 오탐은 없었다.
- API 기본 기동(`dev`)은 Beta 모드다. 자동매매·Paper·Push·Admin API는 `JAVA_TOOL_OPTIONS="-Dspring.profiles.active=dev,trading"`으로만 등록된다(`docs/COMMANDS.md`).
- `labs/trading/web`은 `@web/*` alias로 `apps/web`을 참조하는 보존 코드다. 타입체크는 `apps/web/node_modules` symlink로 로컬에서만 한다.
- 로컬 기동용 Git 밖 파일이 Bubot에 준비돼 있다: 루트 `.env`, `apps/web/.env`, `apps/api/src/main/resources/application*.properties`(MyBatis key `com.bubot`), `ops/back-end.sh`·`worker.sh`. 원본 AutoTrade와 같은 DB·계정을 가리킨다.

## 읽기 안내

- 구현·버그 수정·테스트 시 → `docs/COMMANDS.md` · `docs/PROJECT.md`
- Git·PR 작업 시 → `docs/GIT-WORKFLOW.md`
- Planning 작업 시 → `work-status/planning/COMMON.md` · `work-status/planning/PROJECT-OVERLAY.md`와 활성 PLAN
- 결정·미결 확인 시 → `work-status/DECISIONS.md` · `work-status/OPEN-QUESTIONS.md`
- 문서 역할·기록 경계 → `docs/DOCUMENTATION.md`
