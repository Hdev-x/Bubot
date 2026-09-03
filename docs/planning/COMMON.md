# 공통 작업 계획 Core

- 정책 ID: `ai-workflow-planning@1.1.0`
- Planning Schema: `ai-workflow-planning@1`
- 적용 대상: 여러 세션·Delivery·Gate가 필요한 작업
- 공통 원본: AI Workflow `templates/common/docs/planning/COMMON.md`
- 역할·Workspace 추가 규칙: Manifest의 `planning.overlay`

이 문서는 개인 프로젝트, 팀 PM 프로젝트, 외부 Team Member Worklog가 함께 사용하는 역할 중립
Planning Core다. 공식 Source의 위치·권한·Repository Alias·추가 Gate는 Overlay가 정하며 Core의
계층·상태·검증 하한을 완화할 수 없다.

## 1. 기본 모델

```text
Roadmap
└─ Workstream
   └─ Work Package
      ├─ Outcome·Acceptance
      ├─ Delivery
      │  └─ Task
      └─ Milestone·Gate
```

- **Workspace**: Planning 문서를 소유하는 프로젝트 또는 외부 개인 Worklog다.
- **Roadmap**: 허용된 범위의 방향, Workstream 순서와 큰 Gate를 관리한다.
- **Workstream**: 오래 유지되는 큰 작업 영역이다.
- **Work Package**: 하나의 Outcome을 여러 세션·Delivery로 완성하는 계획 단위다.
- **Outcome**: 사용자·운영자·시스템에서 관찰할 수 있는 결과다.
- **Acceptance**: Outcome 완료를 판정할 관찰 가능한 조건이다.
- **Delivery**: Outcome을 독립적으로 반영·검증·되돌릴 수 있게 나눈 실행 단위다.
- **Task**: Delivery 안에서 수행하는 Checklist·Commit 후보다.
- **Milestone**: 의미 있는 중간 지점이며 작업 Container나 Branch가 아니다.
- **Gate**: 다음 Delivery·Milestone으로 이동할 수 있는지 판정하는 검증 조건이다.

완료 권한과 범위는 Overlay를 따른다. Work Package `completed`를 더 넓은 Release·배포·다른
Owner의 완료로 확대 해석하지 않는다.

## 2. 정본과 우선순위

```text
Overlay가 지정한 공식 Source
→ 요구사항·권한·Git·Issue·PR·결정

Manifest planning.roadmap
→ 허용된 범위의 방향·Workstream 순서·큰 Gate

Manifest planning.current
→ 활성 Work Package·Delivery·Blocker·다음 행동 하나

Manifest planning.work_root/<workstream-id>/<work-package-id>/PLAN.md
→ Work Package의 Outcome·Acceptance·범위·상태·Delivery·Gate 정본
```

- 공식 Source와 개인·실행 계획이 다르면 Overlay가 지정한 우선순위를 따른다.
- 같은 상태를 ROADMAP·CURRENT·PLAN에 반복하지 않는다.
- Workstream별 README·ROADMAP은 Package가 많아 상위 ROADMAP으로 관리하기 어려울 때만 추가한다.
- `TASKS.md`와 `EVIDENCE.md`는 조건부 파일이며 기본 생성물이 아니다.
- 일일 과정·시행착오·대화는 Overlay가 지정한 Log 위치에 남기고 PLAN에 시간순 Log를 쌓지 않는다.
- 완료·대체된 PLAN은 경로를 바꾸지 않고 상태와 대체 관계로 보존한다.

## 3. Work Package 생성 기준

다음 중 하나 이상이면 Work Package로 관리한다.

- 독립 Delivery나 PR이 둘 이상 필요하다.
- 여러 세션에 걸쳐 진행한다.
- UI·API·Data 등 여러 경계를 함께 변경한다.
- 명확한 진입·종료 Gate나 선행 Contract가 있다.
- 파일을 수정하는 Writer가 둘 이상이다.
- 실패 시 Rollback 비용이나 사용자 영향이 크다.
- 하나의 큰 기능·영역 결과로 인식된다.

그보다 작은 수정은 PLAN을 만들지 않고 공식 실행 규칙의 Fast Path를 사용한다.

## 4. 상태

```text
Work Package: planned → ready → active → completed
                                  ├→ hold → active
                                  └→ superseded | cancelled

Delivery: planned → active → review → completed
별도 종료: superseded | cancelled

Milestone·Gate: pending → passed | failed | waived
```

- 실패 Gate는 원인 해결 뒤 재검증해 `passed`로 전환한다.
- `ready`: 선행 조건·범위·Acceptance·첫 Delivery가 확인됐다.
- `hold`: Blocker와 재개 조건을 함께 기록한다.
- `completed`: 필수 Delivery·Acceptance·Gate·정본 Sync가 끝났다.
- `superseded`: 대체 ID를, `cancelled`: 종료 이유를 기록한다.
- `waived`: 이유·영향·승인 근거 없이는 사용할 수 없다.

## 5. PLAN Schema

`PLAN.md`는 YAML Frontmatter의 기계 판독 필드와 Markdown 본문을 함께 사용한다.

필수 Frontmatter:

```yaml
schema: ai-workflow/work-package@1
id: stable-work-package-id
title: Work Package 제목
workstream: stable-workstream-id
state: planned
updated: YYYY-MM-DD
depends_on: []
supersedes: []
outcome: 관찰 가능한 결과 문장
acceptance: []
deliveries: []
milestones: []
extensions: {}
```

- ID와 경로는 `kebab-case`로 만들고 활성화 뒤 바꾸지 않는다.
- Delivery ID는 Workspace 안에서 Work Package를 포함해 식별 가능해야 한다.
- 내부 Dependency는 안정 ID를 사용할 수 있다. 외부 Source·Gate는 `kind`, `id`, `locator`,
  `required_state`, `revision`을 가진 Typed Dependency로 기록한다.
- Delivery는 `kind: git | manual | external`을 사용한다. `git`만 Branch·PR을 요구하며 `manual`은
  Workspace 안의 비Git 실행, `external`은 다른 System·Repository 결과를 추적한다.
- PR 교체 이력은 `pull_requests` 목록의 `url`, `state`, `base`, `head_revision`으로 보존한다.
- Milestone은 `depends_on`, `acceptance`, `unlocks`, `evidence`로 판정 조건과 다음 단계를 연결한다.
- 전용 Metadata는 `extensions.<namespace>` 아래에만 두며 공통 Field를 재정의하지 않는다.
- Frontmatter와 본문에 같은 상태·목록을 이중 작성하지 않는다.
- Evidence는 `kind`, `locator`, `revision`, `observed_at`을 유지한다.

## 6. Delivery·Git 연결

- Workstream과 Work Package에는 장기 Branch를 만들지 않는다.
- `kind: git` Delivery 하나는 원칙적으로 Repository 하나의 Branch 하나와 PR 하나에 대응한다.
- `kind: manual | external` Delivery는 Branch·PR 없이 Evidence와 Gate로 완료를 판정한다.
- `repository` 값과 실제 경로 해석은 Manifest와 Overlay가 정한다.
- Branch 이름과 Commit·PR·CI·Merge 권한은 Overlay가 지정한 공식 Git 정본을 따른다.
- Task는 별도 Branch를 자동 생성하지 않으며 Commit 또는 Checklist로 관리한다.
- PR 본문에는 Work Package ID와 Delivery ID를 기록한다. Fast Path는 `none`을 허용한다.
- PR Merge는 Source 통합일 뿐 Delivery·Work Package·Milestone 완료나 Release를 자동 의미하지 않는다.

```text
PLAN ready
→ Delivery 선택
→ 공식 Git 정본의 최신 통합 Base에서 Branch
→ Task·Commit
→ PR·CI·Review
→ 공식 규칙에 따른 Merge
→ Delivery Gate·Evidence 확인
→ PLAN·CURRENT Sync
```

## 7. 예외와 변경 통제

- **Replacement PR**: 기존 PR Link를 `superseded`, Replacement를 활성 Link로 기록한다.
- **Stacked PR**: PR마다 별도 Delivery로 두고 의존 Delivery·임시 Base·Owner·종료 조건을 기록한다.
- **Multi-repository**: Repository마다 별도 Delivery를 사용한다.
- **Multi-writer**: Worker Branch는 Delivery 내부 구현 수단이다. 독립 Rollback 단위면 별도 Delivery다.
- **Scope change**: 기존 Acceptance 안의 세부 조정은 PLAN에 반영한다. 새 결과·고위험 Gate·독립
  Rollback 단위가 생기면 새 Delivery 또는 Work Package로 분리한다.
- 범위·Gate·Dependency를 조용히 확대하거나 완료 뒤 이력을 다시 쓰지 않는다.

## 8. TASKS·EVIDENCE 분리

- `TASKS.md`: Writer가 둘 이상이거나 여러 세션의 실행 항목이 많아 PLAN만으로 조율하기 어려울 때 쓴다.
- `EVIDENCE.md`: Benchmark·Recovery Matrix·Migration·Security처럼 PR·CI Link만으로 장기 재현이
  어려운 Gate에 쓴다.
- 일반 Test Output·Tool Log·전체 대화를 복제하지 않는다.

## 9. Projection과 Freshness

Database·UI는 파일 정본을 읽어 만든 Projection·Index이며 Source를 대신하지 않는다.

```text
source_path
source_digest
repository_revision
worktree_state
observed_at
freshness
```

감지 우선순위는 Manifest의 명시 경로, `docs/work/**/PLAN.md` 관례, Legacy Adapter 순서다.
외부 Provider Link 없이도 파일과 Local Git만으로 기본 계획을 읽을 수 있어야 한다.

- `detected`: Source Locator를 찾았다.
- `inspectable`: Parse와 Schema 검증에 성공했다.
- `preview-editable`: Source가 Fresh하고 적용 전 문서·Git·Gate 변화를 미리 볼 수 있다.
- `apply-capable`: Preview, Permission, Gate, 명시적 사용자 승인을 모두 충족한다.

Apply 직전 Source Digest·Repository Revision·Worktree State가 Preview 시점과 달라지면 중단하고
다시 Inspect·Preview한다.
