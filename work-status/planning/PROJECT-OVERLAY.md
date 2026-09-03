# Bubot Planning Overlay

> `COMMON.md`의 프로젝트별 확장이다. 공통 계층·상태·정본·Delivery 안전 하한을 완화하지 않는다.

## 권한·정본

- Authority: 이 저장소의 `docs/`·`work-status/`와 코드
- Scope: 프로젝트 전체
- 기본 Delivery repository: `.`
- Git 규칙: `docs/GIT-WORKFLOW.md`

## Workstream

- `import` — 원본 저장소에서 폴더 단위 코드 가져오기 (완료 후 닫음)
- `refactor` — 이름 rename, Beta 제외 기능 `labs` 분리, 코드 정리
- `product` — Beta 기능·배포·모의투자
- 별도 Workstream README·ROADMAP은 만들지 않는다. Track 순서는 `work-status/ROADMAP.md`가 소유한다.

## Work Package

- PLAN이 필요한 작업: 여러 PR·세션에 걸치거나, 명확한 Gate(빌드·기동·배포 검증)가 필요한 작업
- 활성 Work Package는 동시에 1개를 기본으로 한다.
- 단일 PR로 끝나는 수정은 PLAN 없이 Fast Path로 처리한다.

## Delivery·Git

- `kind: git` Delivery는 `main` 대상 PR 하나에 대응하고 Squash and merge로 닫는다.
- Required CI: `.github/workflows/ci.yml` (Web test·build 2종, API compile)
- Gate 명령은 `docs/COMMANDS.md`의 것만 사용한다.

## Gate·Evidence

- 사용자 승인 Evidence가 필요한 Delivery: 실계좌·워커 기동, 배포, 태그·Release, DB 변경, `.env`·properties 수정
- 고정 Revision이 필요한 경우: baseline fixture `--update`, 배포 태그
- `EVIDENCE.md` 분리는 하지 않는다. Evidence는 PLAN frontmatter에 둔다.
