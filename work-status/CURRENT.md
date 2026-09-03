# 현재 상태

- 마지막 갱신: 2026-09-03

> 이 문서는 다음 세션을 위한 상태판이다. 이력을 쌓지 않고 덮어쓴다.
> Branch·Commit·작업 트리는 Git에서, 완료 작업의 상세·증거는 PLAN과 Git History에서 확인한다.
>
> 상태별 자리: 결정 안 됨 → `OPEN-QUESTIONS.md` · 승인·시기 대기 → `Deferred` ·
> 막힘 → `Blocker·주의` · 결정됐고 할 것 → `TODO` · 완료 → 각 PLAN과 Git.

## 현재 목표

- 프로젝트가 지금 달성하려는 결과: 원본 저장소(`Hdev-x/Bullum` `develop`)에서 정리된 코드를 폴더 단위로 가져와 `main`이 빌드·기동되는 기준선을 만든다.
- 완료 기준: `apps/web`·`apps/api`·`shared`·`labs`·`ops`가 들어오고 `docs/COMMANDS.md`의 Gate가 원본과 같은 결과를 낸다.

## TODO

> 우선순위 순이다. 각 항목은 반드시 한 줄로 쓰고 완료하면 지운다.

1. `chore/import-shared` — `shared/` 6개 가져오기 (의존 없음)
2. `chore/import-api` — `apps/api/` 가져오기, `./gradlew compileJava bootWar -x test` 통과
3. `chore/import-web` — `apps/web/` 가져오기, `npm test`·`build`·`build:web` 통과
4. `chore/import-worker` — `labs/trading/worker/` 가져오기
5. `chore/import-ops` — `ops/` 가져오기, `ops/verify` 6종이 원본 baseline과 동일(4 OK, 2 기존 drift)
6. CI guard 제거 (폴더가 다 들어온 뒤)

## Deferred

- Private Worklog 연결(`.ai-workflow.local`) — 원본 저장소 worklog를 이어 쓸지 새로 만들지 결정 후
- 로컬 `ops/back-end.sh`·`worker.sh`(gitignore) 복사 — `ops/` 가져올 때

## 활성 Work Package

- 없음. 가져오기는 각 단계가 독립 PR이라 PLAN 없이 TODO로 관리한다. 다음 큰 작업(리팩터링)부터 `work-status/work/refactor/wp-01-*/PLAN.md`를 만든다.

## 완료된 Work Package (링크만)

<!-- 완료된 PLAN 경로만 한 줄씩. -->

## Blocker·주의

- 없음

## 읽기 안내

- 구현·버그 수정·테스트 시 → `docs/COMMANDS.md` · `docs/PROJECT.md`
- Git·PR 작업 시 → `docs/GIT-WORKFLOW.md`
- Planning 작업 시 → `work-status/planning/COMMON.md` · `work-status/planning/PROJECT-OVERLAY.md`와 활성 PLAN
- 결정·미결 확인 시 → `work-status/DECISIONS.md` · `work-status/OPEN-QUESTIONS.md`
- 문서 역할·기록 경계 → `docs/DOCUMENTATION.md`
