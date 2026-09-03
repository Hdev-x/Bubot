# Bubot 현재 상태

> 새 세션은 이 문서에서 시작한다. 확정 기준은 `DECISIONS.md`, Git 규칙은 `GIT-WORKFLOW.md`.

## 현재 작업

- **현재 목표**: 원본 저장소에서 정리된 코드를 폴더 단위로 가져와 `main`을 빌드 가능한 기준선으로 만든다.
- **가져오기 순서** (각 단계는 PR 하나, 해당 Gate 통과 후 squash merge):
  1. [완료] 루트 뼈대: Git 규칙, PR 템플릿, 훅, CI, AGENTS, docs 현재 상태 문서
  2. `shared/` (의존 없음)
  3. `apps/api/` — `./gradlew compileJava bootWar -x test`
  4. `apps/web/` — `npm run build`, `build:web`, `npm test` (`shared` 필요)
  5. `labs/trading/worker/` (`shared` 필요)
  6. `ops/` — `ops/verify` 6종 (`labs`·`shared` 필요)
- **현재 차단점**: 없음.
- **다음 행동 하나**: `chore/import-shared` 브랜치로 `shared/`를 가져와 PR을 연다.

## 그 다음

- 코드 리팩터링 Work Package: TPM 이름 rename(`com.tj.app`, `TpmApplication`, `tpmApi.ts`, `tpm_token`) → Bubot,
  Beta 제외 기능 `labs` 분리, 로고 자산 교체.
- 배포 대상 결정 후 `war` → `bootJar` 전환과 배포 스크립트 교체.

- 마지막 갱신: 2026-09-03 (저장소 생성, 루트 뼈대 commit).
