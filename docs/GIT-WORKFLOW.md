# Bubot Git 규칙

> 채택: **GitHub Flow** (`main` 하나 + 작업 브랜치) · **Squash merge** · **태그 기반 릴리즈**
> 확정일: 2026-09-03 (D-20260903-02). 변경은 사용자 결정으로만 하고 `work-status/DECISIONS.md`에 기록한다.

## 1. 기본 흐름

```text
최신 origin/main
→ <type>/<kebab-case-summary> 작업 브랜치
→ commit · push
→ main 대상 PR (템플릿 작성)
→ 검증 · 사용자 승인
→ Squash and merge (head 브랜치 자동 삭제)
→ 배포 시점에 태그 + GitHub Release
```

- 장기 브랜치는 `main` 하나다. `develop`은 두지 않는다.
- `main`은 항상 빌드·배포 가능한 상태를 유지한다. 깨진 상태를 `main`에 올리지 않는다.
- 브랜치 하나와 PR 하나는 독립적으로 검증하고 되돌릴 수 있는 결과 하나를 다룬다.
- merge는 코드 통합이며 배포·기능 활성화를 뜻하지 않는다. 배포는 5절의 태그로 표시한다.

## 2. 브랜치

- 새 작업은 원격 상태를 확인한 뒤 최신 `origin/main`에서 시작한다.
- 이름은 `<type>/<kebab-case-summary>`. type은 `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
  예: `refactor/rename-tpm-to-bubot`, `feat/watchlist-sync`, `fix/orderbook-depth`.
- 도구 이름(`claude/`, `codex/`)을 브랜치 목적 대신 쓰지 않는다.
- 같은 목표·완료 조건을 다루는 브랜치·PR이 이미 있으면 새로 만들지 않고 이어서 쓴다.
- 다른 작업의 미커밋 변경은 사용자 작업으로 보고 섞거나 복원하지 않는다.

## 3. Commit·Push

메시지 형식:

```text
<type>: <한국어 요약>

- 변경 이유와 핵심 내용
- 검증: 실행한 명령과 결과, 실행하지 못한 검증
```

- commit은 완료됐거나 복구 가치가 있는 의미 단위로 남긴다.
- commit 전에 순서대로 확인한다: `git status --short --branch` → 전체 diff → stage 대상 →
  `git diff --staged` → Secret·개인정보·로컬 전용 파일·생성물 → 대상 remote·브랜치.
- `.githooks/pre-commit`이 commit 직전 staged 파일의 민감 파일명·secret 패턴을 검사한다(`ops/check-secrets.sh`).
  FAIL이면 commit이 만들어지지 않는다.
- `main` 직접 push는 금지하며 `.githooks/pre-push`가 차단한다. clone 후 한 번
  `git config core.hooksPath .githooks`를 실행한다. `--no-verify` 우회는 하지 않는다.
- force push, 공유 이력의 reset·rebase·amend는 금지한다. 공유 전 commit의 문제도 새 commit으로 고친다.

## 4. PR과 Merge

- 모든 변경은 `main` 대상 PR로 들어간다. 짧은 작업은 검증 후 바로 Ready PR, 긴 작업은 첫 공유 가능
  단위를 push한 뒤 Draft PR을 연다.
- 본문은 `.github/pull_request_template.md`대로 목적·변경·검증·영향·체크를 채운다. 체크 항목은 사람이 판단해야 하는 무관한 변경·Secret 두 가지만 두고, 나머지는 검증·영향 절과 GitHub 설정이 맡는다.
- 관련 없는 변경이 섞였으면 merge 방식으로 숨기지 않고 PR을 나눈다. stacked PR은 기본 흐름이 아니다.
- merge 전 확인: 관련 CI 성공(구성된 경우), 미해결 리뷰 없음, 전체 diff·Secret·생성물·DB·배포 영향
  확인, 사용자의 `main` 반영 승인.
- **Squash and merge만 사용한다.** squash 제목은 PR 제목(`<type>: <요약>`), 본문은 PR 본문이 된다.
  merge commit과 rebase merge는 GitHub 설정에서 끈다.
- merge된 head 브랜치는 원격에서 자동 삭제하고 로컬은 `git fetch --prune` 뒤 정리한다.

## 5. 릴리즈와 배포

- 배포 시점의 `main` commit에 SemVer 태그를 찍고 GitHub Release를 만든다.
  베타는 `v0.1.0-beta`, `v0.1.1-beta`처럼 pre-release 접미사를 쓰고 Release도 pre-release로 표시한다.
  정식은 `v1.0.0`부터다.
- Release 노트에는 사용자 관점 변경, 검증 결과, 알려진 제한을 적는다. 배포 산출물(war·jar)을 첨부할 수 있다.
- 태그·Release 생성, 실제 배포는 별도 사용자 승인 항목이다.
- **베타 브랜치는 지금 만들지 않는다.** 정식 출시로 정식(`main`)과 다음 버전 베타를 동시에 운영해야
  할 때 그 시점의 `main`에서 `beta` 브랜치를 만들고, 새 기능은 `beta`로, 정식 긴급 수정은 `main`으로
  PR한 뒤 `beta`에도 반영한다.
- **release 브랜치도 기본으로 두지 않는다.** 배포된 태그에 긴급 수정이 필요한데 `main`이 이미
  앞서 있을 때만 해당 태그에서 `release/<major>.<minor>.x`를 따서 수정·태그 후 `main`에 합치고 삭제한다.

## 6. 복구

- merge 후 문제는 새 fix PR 또는 revert PR로 고친다. 이력을 되돌리지 않는다.
- 미병합 브랜치 삭제, 태그·Release 삭제, DB·배포 산출물 복구는 별도 사용자 승인을 받는다.

## 7. CI

- `.github/workflows/ci.yml`이 `pull_request`와 `main` push에서 실행된다.
- job: `web`(`apps/web` — `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm run build:web`), `api`(`apps/api` — `./gradlew test`, 컴파일 포함).
  로컬 `docs/COMMANDS.md`와 같은 명령만 쓴다. CI 전용 명령을 만들지 않는다.
- 운영 안전장치: `permissions: contents: read`, 같은 ref의 이전 실행 취소(`concurrency`), job별 `timeout-minutes`, npm·Gradle 캐시.
- 폴더 가져오기 동안 쓰던 폴더 부재 guard는 2026-09-03에 제거했다. 처음에는 전체를 실행한다. 실행 시간이 10분을 넘기 시작하면 경로 필터(`apps/web/**`+`shared/**` → web, `apps/api/**` → api)를 도입하되,
  required check와 함께 쓸 때는 skip된 job이 merge를 막지 않도록 처리한다.
- 아직 CI에 없는 것: Worker verify(baseline drift 정리 후 추가). API `test`는 2026-09-03부터 포함(test 프로필). Web lint는 2026-09-03부터 포함(error 0 유지, warning은 baseline).
- Check가 실패·대기·취소된 PR은 merge하지 않는다. Ruleset을 적용하면 required check로 서버에서도 강제한다.

## 8. GitHub 저장소 설정

```text
Default branch               main
Squash merge                 enabled  (title: PR title, message: PR body)
Merge commit                 disabled
Rebase merge                 disabled
Delete head branches         enabled
Ruleset (main)               미정 — 적용 시 PR 필수 · force push 금지 · 브랜치 삭제 금지
CI                           .github/workflows/ci.yml (web · api)
```

Ruleset이 없는 동안에는 pre-push 훅, CI 결과 확인, PR 템플릿, 사용자 승인으로 같은 하한을 지킨다.
