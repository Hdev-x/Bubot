# 현재 상태

- 마지막 갱신: 2026-09-03 (wp-02 완료)

> 이 문서는 다음 세션을 위한 상태판이다. 이력을 쌓지 않고 덮어쓴다.
> Branch·Commit·작업 트리는 Git에서, 완료 작업의 상세·증거는 PLAN과 Git History에서 확인한다.
>
> 상태별 자리: 결정 안 됨 → `OPEN-QUESTIONS.md` · 승인·시기 대기 → `Deferred` ·
> 막힘 → `Blocker·주의` · 결정됐고 할 것 → `TODO` · 완료 → 각 PLAN과 Git.

## 현재 목표

- 기준선 Track 완료(2026-09-03, PR #3~#7): `shared`·`apps/api`·`apps/web`·`labs/trading/worker`·`ops`가 원본 `develop`과 blob hash 동일하게 들어왔고, Web tests 22·build 2종·API bootWar·`ops/verify` 6종이 원본과 같은 결과다.
- 배포 전 품질 정리 완료(2026-09-03): README, CI lint(error 0·warning baseline 320), API test(H2 test 프로필), Ruleset `main-protection`.
- 프로젝트가 지금 달성하려는 결과: 다음 단계 선택 대기 — (a) 배포 `wp-03`(도메인·DB 위치 결정 필요, Deferred) 또는 (b) 코드 품질 리팩터링 WP(lint warning baseline 축소·큰 파일 분해, 사용자와 항목별 진행).
- 완료 기준: 사용자가 (a)/(b) 중 하나를 고르고 해당 PLAN이 승인된다.

## TODO

> 우선순위 순이다. 각 항목은 반드시 한 줄로 쓰고 완료하면 지운다.

1. 다음 Work Package 선택: 배포(`wp-03`, 도메인·DB 결정 후) 또는 코드 품질 리팩터링(OQ-11 baseline 축소부터, 사용자와 항목별)
2. 원본 AutoTrade 저장소 정리: 병합된 branch 삭제(승인 대기), CURRENT에 "제품 작업은 Bubot으로 이관" 기록

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
