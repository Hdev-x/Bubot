# 공통 작업 계획 Core

- 정책 ID: `ai-workflow-planning@1.3.1`
- Planning Schema: `ai-workflow-planning@1`
- 적용 대상: 여러 세션·Delivery·Gate가 필요한 작업
- 공통 원본: AI Workflow `templates/common/work-status/planning/COMMON.md`
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

Manifest planning.work_root/<short-workstream-id>/<wp-NN-short-name>/PLAN.md
→ Work Package의 Outcome·Acceptance·범위·상태·Delivery·Gate 정본
```

- 공식 Source와 개인·실행 계획이 다르면 Overlay가 지정한 우선순위를 따른다.
- 같은 상태를 ROADMAP·CURRENT·PLAN에 반복하지 않는다.
- Workstream별 `README.md`는 Package가 둘 이상이거나 번호·Locator Index가 필요할 때만 추가한다. 이름·경로·역할만
  보여주는 Projection이며 상태·Priority·Dependency 정본을 복제하지 않는다. `STRUCTURE.md`·`GIT-DELIVERY.md` 같은
  Workstream 문서는 Project Trigger가 있을 때만 Overlay 규칙으로 추가한다.
- `TASKS.md`, `EVIDENCE.md`, `execution-packets/<packet-id>.md`는 조건부 Artifact이며 기본 생성물이 아니다.
- 일일 과정·시행착오·대화는 Overlay가 지정한 Log 위치에 남기고 PLAN에 시간순 Log를 쌓지 않는다.
- 완료·대체된 PLAN은 경로를 바꾸지 않고 상태와 대체 관계로 보존한다.

### Workstream·Work Package Naming과 identity

새 Planning 경로의 기본 문형은 `work/<short-workstream-id>/<wp-NN-short-name>/`이다.

```text
work/
└── disease-ai/                 짧고 안정적인 Workstream ID
    ├── README.md               Package Index가 필요할 때만
    ├── wp-01-contract/
    │   └── PLAN.md
    └── wp-02-safety/
        └── PLAN.md
```

- Workstream ID는 lowercase alphanumeric token 1~3개로 만든 `kebab-case`의 짧고 안정적인 Domain·Outcome 이름을
  사용한다. 경로 자체가 Workstream임을 이미 나타내므로 의미 없는 `-analysis`, `-implementation`, `-project`,
  `-workstream` suffix를 반복하지 않는다.
- 신규 Work Package ID는 `wp-NN-short-name`을 기본으로 한다. `NN`은 생성할 때 배정하는 두 자리 고정 식별 번호이며
  Priority·Stage·Dependency가 아니다. 번호는 재정렬·재사용하지 않고 빈 번호가 생겨도 유지한다.
- `wp-00-*`은 Bootstrap·개인 개발 기반처럼 실제 선행 기반 Package가 있을 때만 선택하며 모든 Workstream에
  빈 Package로 만들지 않는다.
- `short-name`은 lowercase alphanumeric token 1~3개로 만들고 File Explorer에서 역할을 구분할 최소 의미만
  남긴다. 제목·범위 표현이 바뀌면 PLAN `title`을 갱신하고 활성화된 폴더명과 ID는 바꾸지 않는다.
- Work Package의 정식 identity는 `(workstream, id)` 쌍이다. 공식 PLAN locator는
  `plan:<workstream-id>/<work-package-id>`를 사용한다. 같은 Workstream 안의 `depends_on`은 local Work Package ID를
  사용할 수 있고, 다른 Workstream Dependency는 qualified locator를 가진 Typed Dependency로 기록한다.
- 기존 `plan:<work-package-id>` locator는 Workspace 전체에서 exact ID가 하나일 때만 Legacy로 해석할 수 있다.
  중복·미해결이면 추정하지 않고 qualified locator를 요구한다.
- 기존 Workstream·Work Package·Link는 정책 Upgrade만으로 Rename·이동·재번호하지 않는다. Rename이 필요하면
  old→new mapping, Link·Dependency coverage, 활성 상태와 Evidence 보존을 별도 Migration Gate로 검증한다.

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

PLAN의 모든 top-level Acceptance와 `waived`가 아닌 Milestone·Gate Criterion은 required다. Overlay나
EVIDENCE가 이를 optional로 낮출 수 없다. `waived`는 Criterion requiredness 변경이 아니라 exact 이유·영향·
승인 근거에 결속된 Gate 전체 면제다.

## 5. PLAN Schema

`PLAN.md`는 YAML Frontmatter의 기계 판독 필드와 Markdown 본문을 함께 사용한다.

필수 Frontmatter:

```yaml
schema: ai-workflow/work-package@1
id: wp-01-short-name
title: Work Package 제목
workstream: short-workstream-id
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

- ID와 경로는 위 Naming 문형의 `kebab-case`로 만들고 활성화 뒤 바꾸지 않는다.
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

## 8. 네 작업 Artifact 분리

- `TASKS.md`: Writer가 둘 이상이거나 여러 세션의 실행 항목이 많아 PLAN만으로 조율하기 어려울 때 조건부로 쓴다.
- `EVIDENCE.md`: Benchmark·Recovery Matrix·Migration·Security처럼 PR·CI Link만으로 장기 재현이
  어려운 Gate에 쓴다.
- `execution-packets/<packet-id>.md`: 위임·Multi-writer·고위험 실행처럼 특정 Attempt의 Base·Executor·Path·
  Capability·Git 상한·중단·Recovery·Handoff를 고정해야 할 때 조건부로 쓴다.
- 일반 Test Output·Tool Log·전체 대화를 복제하지 않는다.

```text
PLAN Delivery·Acceptance·Gate
→ 조건부 TASKS
→ 조건부 Execution Packet
→ 구현·검증
→ 조건부 EVIDENCE
→ PLAN Owner의 전체 완료 판정
```

`Packet closed != Task passed != Evidence PASS != Delivery completed != Work Package completed`다. CURRENT는
활성 Work Package·Delivery·Blocker와 exact current 또는 next runnable Task·Packet을 가리키는 행동 Pointer만 소유한다.

### TASKS 공통 계약

이 구획은 `TASKS.md`의 생성·형식·상태·안전·동기화·Migration 의미를 소유하는 유일한 공통 정본이다.
`TASKS-CHECKLIST-PRESET.md`는 복사용 비규범 scaffold이며 충돌하면 이 계약을 따른다.

#### 1. 생성 조건과 형식 선택

`TASKS.md`는 다음 중 하나 이상이면서 PLAN의 Delivery Notes만으로 실행 순서와 검증을 안전하게 조율하기
어려울 때 만든다.

- 여러 세션에 걸친 순차 Task가 많다.
- Writer·Owner·담당 경계가 둘 이상이다.
- 승인·Security·Migration·Rollback·Cleanup 같은 독립 Gate를 세부 단계에서 추적해야 한다.
- Task별 Evidence나 Handoff를 장기 추적해야 한다.
- 현재 위치와 다음 행동을 별도 Checklist에서 계속 복원해야 한다.

한 세션의 저위험 수정, 단일 Delivery의 짧은 작업, 공식 Fast Path에는 만들지 않는다. PLAN에 충분한 Task를
다시 복제하지 않는다. `TASKS.md`가 없는 상태도 유효하다.

생성 조건을 통과한 뒤 표현 형식을 고른다.

| 형식 | 선택 조건 |
|---|---|
| Minimal Checklist | 한 Stage로 충분하고 비선형 Dependency·단계 간 Handoff가 없음 |
| Staged Checklist | Stage가 둘 이상이거나 비선형 Dependency·승인·Blocker·다중 세션 Handoff를 단계별로 추적해야 함 |

신규 TASKS는 Minimal 또는 Staged만 사용한다. 실행 경계가 함께 필요하면 별도 형식인 Hybrid를 만들지 않고
`TASKS + Execution Packet`을 조합한다. 기존 active·reviewed·completed Task Packet·Hybrid는 공통 정책 채택이나
Upgrade만으로 형식을 바꾸지 않는 Legacy 문서다.

#### 2. 문서 lifecycle과 Promotion

제목 바로 아래의 문서 계약에는 최소한 다음을 둔다.

- 문서 상태: `proposal` 또는 `execution`
- PLAN: Execution은 exact revision·Acceptance locator, Proposal은 예상 Work Package·Delivery 또는 decision locator
- checkbox 의미와 선택한 형식: Minimal 또는 Staged
- Proposal에서 승격된 경우 frozen Source Proposal과 Promotion receipt
- Evidence Trigger가 참인 경우에만 Evidence locator
- Packet Trigger가 참인 Task에만 exact Execution Packet locator

Proposal에서는 다음을 지킨다.

- `[ ]`는 Proposal 범위에 채택되지 않은 후보다. 인접 disposition으로 `pending | rejected | deferred`를 구분한다.
- `[x]`는 decision receipt로 Proposal 범위에 채택된 후보일 뿐, 실행 완료나 `passed`가 아니다.
- 채택 후보는 disposition `adopted`와 `[x]`를 함께 사용한다. 기각·보류 후보는 `[ ]`를 유지하고
  `rejected | deferred`, 이유, decision locator, successor를 바로 아래에 적는다.
- 실행 진행률처럼 보이는 `0/20 완료`를 표시하지 않는다.
- PLAN이 아직 없으면 예상 Work Package·Delivery 또는 `미정 + decision locator`를 적는다.
- Proposal Stage 상태는 `검토 | 결정 대기 | 채택 | 보류`를 사용한다. `선택 | 후속`은 상태가 아니라 성격이다.
- Proposal 채택만으로 실행 권한이나 수정 경로가 생기지 않는다.

Execution에서는 다음을 지킨다.

- PLAN의 revision과 Acceptance 구획을 고정한다.
- `[x]`는 완료 기준과 검증을 충족한 `passed`만 뜻한다.
- Proposal checkbox 상태를 Execution으로 자동 승계하지 않는다.
- Authority·Gate가 미확정인 승격 항목은 `blocked` 또는 공식 External Dependency로 옮긴다.

Proposal을 Execution으로 승격할 때 Promotion receipt 한 곳에 다음을 남긴다.

- frozen Proposal locator와 SHA-256
- 해당하는 독립 Review·사용자 결정·팀 승인 locator
- Source Task → Work Package·Delivery·Execution Task mapping
- 실행으로 옮기지 않은 모든 Source 후보의 `rejected | deferred` mapping과 decision·successor
- `lost requirement 0`
- `orphan Task 0`

Execution 문서 계약은 frozen Proposal과 receipt를 연결한다. reviewed digest가 달라지면 기존 verdict를 승계하지
않고 새 Review나 exact Delta·승인 locator를 요구한다.

#### 3. 정본 Owner와 상위 완료 판정

| 문서 | 유일하게 소유하는 정보 |
|---|---|
| `PLAN.md` | Work Package·Delivery·Milestone 상태, required 범위, Acceptance·Gate, 전체 완료 판정 |
| `TASKS.md` | stable Task ID, Checklist 순서·Dependency·Owner·checkbox와 Task status·완료 확인 |
| `EVIDENCE.md` 또는 공식 Evidence | Criterion별 실제 관찰값·`PASS | FAIL | UNKNOWN`·receipt·digest·재현 한계 |
| Execution Packet | Attempt별 Source binding·Base·Executor·Owned/Protected Path·Capability·Git 상한·Stop·Recovery·Handoff |
| `CURRENT.md` | 활성 Work Package·Delivery·Blocker와 행동 포인터 하나 |
| TASKS 한눈에 보기·단계 지도 | 위 Owner 값을 사람이 읽기 쉽게 보여주는 Projection |

CURRENT의 행동 포인터는 실행 중인 Task가 있으면 exact current Task, 실행 중인 Task가 없으면 exact next runnable
Task를 가리킨다. 동시에 둘을 정본으로 소유하지 않는다. runnable Task가 없으면 Blocker·decision locator를
가리킨다.

Dependency Owner는 수준별로 나눈다. PLAN은 Delivery·Gate dependency, TASKS는 Task 실행 dependency,
공식 Architecture·Requirement Source는 도메인 dependency를 소유한다. TASKS는 상위 dependency를 locator로만
가리키며 의미를 바꾸지 않는다.

- 현재 Acceptance 또는 non-waived Gate에 연결된 required Task가 미완료면 관련 Delivery·Milestone·Work Package를
  완료 처리하지 않는다.
- TASKS의 모든 checkbox가 끝나도 PLAN은 자동 완료되지 않는다. PLAN Owner가 Acceptance·Gate·Evidence를 대조해
  전체 완료를 판정한다.
- 사용자 승인은 PLAN Gate의 Evidence·receipt다. TASKS는 승인 요청·확인 행동을 추적할 수 있지만 승인 상태를
  소유하지 않는다.
- 실제 관찰 결과를 TASKS에 복제하지 않고 exact locator만 연결한다.
- Packet 종료를 Task passed나 Evidence PASS로 자동 해석하지 않는다.

#### 4. 문서 언어·Task 문장·stable ID

- 사람이 읽는 제목·설명·Checklist는 Project가 정한 주 언어의 쉬운 행동 문장으로 쓴다.
- 일반 표현을 가독성 근거 없이 불필요하게 English로 바꾸지 않는다.
- path·command·option·field·enum·stable ID·version·digest·environment/property key·SQL·code·제품명과 exact
  source text는 English 원형을 유지한다.
- 학습자가 바로 이해하기 어려운 English 용어는 최초 등장 시 `English(한국어 역할)`처럼 한 번 설명한다.
- machine-only artifact와 원문 Log는 예외지만 사용자 판단이 필요하면 주 언어의 짧은 요약을 덧붙인다.

모든 status-bearing Task는 Work Package 안에서 유일한 stable ID를 가진다. 순수 실행 메모만 ID 없이 둘 수 있다.
사람이 읽는 Task 한 항목은 다음 의미를 가져야 한다.

```text
정확한 대상 + 수행 행동 또는 판정 + 완료 확인
```

- 한 Task에는 독립적으로 pass/fail을 판정할 행동 또는 판정 하나만 둔다.
- 행동과 검증이 서로 독립적으로 실패할 수 있으면 Task를 나눈다.
- `구현한다`, `처리한다`, `확인한다`처럼 대상이나 통과 조건이 없는 문장으로 끝내지 않는다.
- 순서가 중요하면 나열에만 기대지 않고 stable ID와 선행 조건을 적는다.
- 긴 명령·mount path·permission 값·반복 실행 방법은 실행 메모로 내릴 수 있지만 의미는 보존한다.

#### 5. Task 상태·진행도·Stage Projection

Execution Checklist의 Task status는 다음과 같다.

- `pending`: passed·blocked·deferred·cancelled가 아닌 미완료 상태. 일반 Dependency 대기도 포함
- `passed`: 완료 기준과 검증을 충족
- `blocked`: 필수 조건 때문에 진행할 수 없음
- `deferred`: PLAN이 현재 required 범위 밖의 후속 작업으로 연기
- `cancelled`: PLAN이 현재 required 범위에서 공식 제외

Execution Task는 기본 required다. optional Task는 `Required: no`와 해당 Task를 현재 required 범위에서 제외한
exact PLAN Criterion 또는 scope decision locator를 함께 둘 때만 허용한다. required 진행도 분모는 이 기본값과
locator에서 재계산할 수 있어야 한다.

`runnable`은 status가 아니라 Dependency·Gate·CURRENT에서 계산하는 파생 값이다.

`[x]`는 `passed`만 뜻한다. blocked·deferred·cancelled는 `[ ]`를 유지한다. Task가
blocked·deferred·cancelled로 바뀌는 즉시 Task 가까이에 `상태·이유·Acceptance 영향·Owner·decision locator·
재개 조건 또는 successor`를 필요한 범위에서 기록한다. required 제외나 deferred·cancelled 판정에는 PLAN
decision이 필요하다. `Task status`와 구조 전환의 `migration disposition`은 다른 개념이며 같은 field로 섞지 않는다.

숫자 진행도는 같은 수준의 status-bearing Task에서만 다시 계산한다. 전체 상태 Vector와 현재 Acceptance의
required 분모를 구분하고, Task 수를 작업량·기간 백분율로 해석하지 않는다.

Execution 단계 지도 상태는 아래 순서에서 처음 일치하는 하나로 계산한다.

| 우선순위 | 상태 | 판정 조건 |
|---|---|---|
| 1 | `완료` | Stage의 required Task와 연결 Gate가 모두 `passed` |
| 2 | `진행 중` | runnable Task가 있고, CURRENT가 그 Stage Task를 가리키거나 required Task가 하나 이상 `passed` |
| 3 | `승인 대기` | runnable Task가 없고, 남은 모든 차단 조건이 외부 승인 receipt임 |
| 4 | `blocked` | runnable Task가 없고, required Task·Gate 실패/차단 또는 필수 Source 부재가 하나 이상 있음 |
| 5 | `대기` | 위 네 조건에 해당하지 않음. 미시작 runnable Task나 일반 Dependency 대기도 포함 |

`승인 대기`는 외부 승인만 남은 특수한 blocked 상황이지만 지도에서는 별도 상태로 표시한다. 한 Stage가
`승인 대기`와 `blocked`를 동시에 갖지 않는다. `선택 | 후속 | 외부 Gate`는 상태가 아니라 성격이다.
Stage는 별도 상태 Owner가 아니며 이 값은 Task·PLAN·Gate·CURRENT의 Projection이다.

#### 6. 선택 확장 Trigger

Trigger가 참이면 해당 최소정보를 빠짐없이 적고, 거짓이면 heading 자체를 만들지 않는다.

| 실제 조건 | 추가할 최소정보 |
|---|---|
| Writer가 둘 이상이거나 외부 수행자·Approver·Consumer 존재 | Task Owner와 실제 역할·Dependency·필요하면 Execution Packet locator |
| 다른 Writer에게 실제 파일 수정을 맡기거나 exact Path 경계가 필요 | stable Task ID와 해당 Execution Packet locator |
| 인접 기능·다른 저장소·보호 경로 오수정 위험 | Task Scope와 해당 Execution Packet locator · Path·Capability 원문은 Packet 소유 |
| 선행 Task·외부 입력·승인이 시작이나 완료를 좌우 | Dependency·필요 상태·Owner·영향·재개 조건 |
| Review·CI·사용자 승인·보안 확인이 완료를 좌우 | Gate·Approver·진입·통과·실패·만료 조건 |
| 삭제·Migration·Data·Secret·Permission·배포·비용 작업 | PLAN Gate·Task 완료 기준·Execution Packet·Evidence locator |
| 완료·안전·복구 판단에 실제 결과가 필요 | Evidence 대상·방법·통과 조건·관찰 시점·immutable locator |
| 다른 Owner·세션·Project가 결과물을 이어받음 | Consumer·exact 산출물·검증 상태·제약·재개 첫 행동 |
| Runtime·Branch·OS·Provider 차이가 결과에 영향 | Environment·revision·drift 중단 조건 |
| 종료 시 non-pass Task 또는 required 범위 변경 | status·이유·영향·Owner·decision·재개 조건 또는 successor |

같은 정보가 여러 Stage에 적용되면 상단에 한 번 적고 Stage에는 차이만 둔다. 한 Task에만 필요한 정보는 해당
Task 바로 아래에 둔다. 외부·frozen locator는 revision 또는 digest를 고정한다. 같은 문서 계약의 PLAN locator를
반복할 때만 상단 revision 상속을 허용하며, 다른 Source는 각자 revision을 적는다.

필요한 Dependency·Gate·Evidence·Handoff Source가 없으면 완료로 추정하지 않는다. 해당 Task를 `blocked`로 두고
Source를 확정할 decision locator와 재개 조건을 남긴다.

#### 7. 안전·Authority·Evidence 하한

다음 조건은 독립 Task, Stage 완료 기준 또는 PLAN Gate 중 하나에 실제로 판정 가능하게 남긴다.

- 사용자 승인과 권한 경계
- Secret·개인정보 비노출
- Transaction rollback·Recovery·Data 보존
- 임시 File·Process·Container Cleanup
- 최소권한과 credential 무효화
- Migration·Schema 호환성
- 다음 단계 진입을 막는 Health·Build·Test·Review Gate

순수 실행 방법만 실행 메모로 이동할 수 있다. 승인·Security·Rollback·Cleanup 같은 안전 조건을 `주의`나
실행 메모에만 숨기지 않는다.

- TASKS·Execution Packet·Overlay는 스스로 수정 권한을 만들지 않고 공식 Authority Source를 가리킨다.
- Authority Source가 없는 path는 read-only 또는 blocked로 둔다.
- 외부 Owner가 수행할 일은 우리 passed Task로 소유하지 않는다. 우리 Task에는 요청·확인·Evidence 기록처럼
  실제로 우리가 수행할 행동만 둔다.
- Secret·개인정보의 실제 값을 기록하지 않고 승인된 보안 저장소의 locator만 사용한다.
- 실행하지 않은 검증을 Evidence로 기록하지 않는다.
- Acceptance·Security·승인·Rollback 판단에 실제 결과 보존이 필요한 조건은 Evidence Trigger를 발생시키며,
  해당 Task는 실제 Evidence locator를 가진다.
- locator는 조건부 `EVIDENCE.md`, PLAN evidence, PR·CI·Review artifact 또는 공식 외부 Source가 될 수 있다.
- 일반 명령마다 별도 EVIDENCE 파일을 만들지 않는다.
- Evidence Trigger가 없으면 field를 생략한다. 일반 Task에서 `N/A`를 채우지 않는다.
- `N/A + 이유`는 구조 Migration에서 순수 `execution-note`로 판정한 mapping row에만 허용한다.

#### 8. Requirements mapping과 상위 계약 변경

공식 Requirement 추적이 필요하면 Owner를 다음처럼 나눈다.

- 공식 Source: Requirement 정의
- PLAN: required 범위·Acceptance
- TASKS·Proposal·EVIDENCE 중 한 곳: 상세 Task mapping

Proposal은 승격 전 candidate mapping을 소유할 수 있다. 승격 뒤에는 Execution TASKS 또는 EVIDENCE 한 곳으로
상세 Owner를 옮기고 Proposal은 frozen Source로만 연결한다. 다른 문서에는 상태 요약·locator·누락 감사만 둔다.

`lost requirement`는 required Requirement에 Task·공식 disposition·External Dependency 연결이 없는 상태다.
`orphan Task`는 공식 Requirement·PLAN Acceptance·Gate·공식 Dependency 어느 것에도 연결되지 않은 Task다.
`lost independent gate`는 독립 pass/fail·승인·보존·cleanup 판정이 target Task·Stage 기준·PLAN Gate 어디에도
보존되지 않은 상태다.

TASKS는 Proposal·Blueprint·PLAN·공식 Authority Source가 소유하는 방향·Architecture·Scope·Authority·
Acceptance·Gate·Dependency를 조용히 바꾸지 않는다. 변경이 필요하면 해당 Task를 중단하고 Issue·Decision 또는
successor contract를 만든 뒤 semantic Owner와 영향받은 Review Evidence를 먼저 갱신한다. 기존 digest를 계속
참조하려면 적용 Delta와 승인 locator가 그 revision을 실제로 보존하는지 확인한다.

#### 9. Projection 동기화

동기화는 정본을 먼저, Projection을 나중에 고친다.

```text
Task check·status·Dependency: TASKS
Delivery·requiredness·Acceptance·Gate: PLAN
관찰 결과: EVIDENCE 또는 공식 Evidence
Attempt 경계·권한 상한: Execution Packet
행동 포인터·Blocker: CURRENT
→ TASKS 한눈에 보기·단계 지도·세션 표시
```

위 정본 중 하나가 바뀌어 표시 값도 달라지는 같은 변경에서 다음을 함께 갱신한다.

- TASKS 전체 상태 Vector
- 한눈에 보기의 현재 Stage·Task·다음 행동·Blocker
- 단계 지도
- CURRENT의 exact current 또는 next runnable Task·Blocker

checkbox가 그대로여도 CURRENT 포인터·Blocker·PLAN Gate가 바뀌면 Projection을 맞춘다. 설명만 바뀌고 현재
위치·다음 행동·진행도가 같다면 상태 문서를 불필요하게 수정하지 않는다.

Mismatch를 발견하면 같은 revision의 Owner 원문을 대조해 Projection을 고친다. 요약값으로 PLAN·EVIDENCE·
CURRENT를 역으로 덮어쓰지 않는다. Scope·Gate·Dependency·Authority가 바뀌면 상위 계약 변경 규칙을 따르고
영향받은 Evidence를 `stale`로 표시한 뒤 TASKS·CURRENT를 동기화한다.

#### 10. Staged 화면 구조

Staged를 선택한 문서에만 `한눈에 보기`와 `단계 지도`를 필수화한다.

```text
# TASKS.md
├─ 문서 계약                         필수
├─ 한눈에 보기                       필수
├─ 단계 지도                         필수
├─ 공통 선택 확장                    공통 Trigger가 있을 때
├─ S1~Sn
│  ├─ 목적                           필수
│  ├─ 완료 기준                      필수
│  ├─ 전체 Checklist                 필수
│  ├─ 실행 메모                      실제 실행 방법이 있을 때
│  └─ Stage·Task 선택 확장           해당 Trigger가 있을 때
├─ Requirements Coverage             공식 Requirement 추적이 필요할 때
├─ Gate·Evidence Index               여러 Stage에서 함께 찾을 때
├─ 잔여 상태·전체 Handoff            non-pass 종료나 실제 인계가 있을 때
└─ 용어 설명                         필요할 때 · 항상 마지막
```

Execution의 `한눈에 보기`는 4~6줄 안에서 전체·required Task 잔여 수, 현재 Stage·Task, 바로 다음 행동,
Blocker·승인 대기, 현재 Gate·핵심 완료 기준을 답한다. Proposal은 실행 진행도를 표시하지 않고 제안 범위·첫
검토 후보·결정 필요·Blocker를 보여준다.

단계 지도에서 각 Stage는 한 번만 표시하고 다음을 가진다.

- lifecycle에 맞는 상태와 `선택 | 후속 | 외부 Gate` 성격
- stable Stage ID·제목
- Execution의 exact PLAN Delivery 또는 Proposal의 예상 Delivery·decision locator
- 끝나면 확보되는 결과
- Execution의 passed/total 또는 Proposal의 후보 Task 수
- 선행·병렬·외부 Dependency

지도에는 checkbox를 만들지 않는다. 2~5개의 거의 선형 Stage는 목록, 6개 이상이거나 병렬·선택 Track을
비교해야 하면 `상태·성격 | Stage·Delivery | 완료 결과·Tasks | 선행` 최대 4열 표를 사용한다.

각 Stage는 `목적 → 완료 기준 → 전체 Checklist → 필요한 실행 메모` 순서를 지킨다. Checklist는 일부 핵심
목록이 아닌 status-bearing Task 전체다. 실행 메모에는 순수 실행 방법만 두고 실제 결과는 Evidence가 소유한다.
공식 Requirement 전문·Test 결과·일반 변경 이력을 복제하지 않는다.

#### 11. Legacy Task Packet·Hybrid 호환성

신규 TASKS 형식으로 Task Packet·Hybrid를 만들지 않는다. 기존 문서는 경로와 bytes를 보존하며, 포함된 Packet
의미는 최소한 다음을 유지한다.

- 대응 Delivery·Task ID와 선행 조건
- exact input과 목표·제외 범위
- Writer·Owned Path·Protected Path
- 허용 행동·금지 행동·충돌 규칙
- 검증 명령·Gate
- 완료 판정
- Consumer·산출물·제약·재개 첫 행동을 포함한 Handoff

Legacy Packet의 item status는 선택이다. status가 없으면 임의로 passed나 checkbox로 바꾸지 않는다. 신규로 같은
기능이 필요하면 Minimal·Staged TASKS와 독립 Execution Packet을 사용한다.

Packet을 Checklist로 바꾸는 Migration에서는 checkbox뿐 아니라 위 field의 source→target mapping과 semantic
loss 0을 Gate로 삼는다. status가 없는 Packet item은 `not-status-bearing`과 PLAN Delivery Projection locator를
기록한다. duplicate legacy ID는 exact heading·ordinal·source digest를 함께 사용해 mapping row를 유일하게
식별하며 자동 renumber하지 않는다. 기존 Packet을 빈 Stage·진행률 중심 문서로 자동 변환하지 않는다.

#### 12. 기존 TASKS 보호와 구조 Migration

기존 active·reviewed·completed TASKS는 Upgrade나 공통 정책 채택만으로 자동 재작성·이동·축약하지 않는다.
일반 Task 추가·완료·오탈자 수정에는 Migration Matrix를 요구하지 않는다.

다음은 구조 Migration Trigger다.

- 기존 Task 병합·분할·삭제·재번호화
- checkbox를 실행 메모로 이동하거나 반대로 승격
- 상태·Dependency·Gate·Evidence·Owner 의미 변경
- Checklist·Packet 사이 형식 전환

source revision과 SHA-256을 고정하고 별도 receipt에 다음 대응을 기록한다.

```text
Source item locator(ID 또는 heading·ordinal·digest)·status 또는 not-status-bearing·의미
→ Target ID 또는 실행 메모 locator
→ migration disposition
→ Owner·Dependency
→ Evidence locator 또는 execution-note에만 허용된 N/A 사유
```

허용 migration disposition은 다음과 같다.

- `independent-check`: 독립 pass/fail·승인·보존·cleanup 판정과 Evidence 유지
- `merged-acceptance`: 상위 Task·Stage 완료 기준에 통합하고 target·Evidence에 결속
- `execution-note`: 결과 판정에 영향 없는 실행 방법만 이동
- `retired-with-reason`: PLAN이 현재 범위 밖임을 판정하고 decision·successor 기록

Migration Gate:

```text
source coverage 100%
orphan Task 0
lost requirement 0
lost independent gate 0
status regression 0
unintended duplicate owner 0
broken locator 0
Projection mismatch 0
Packet field semantic loss 0
```

현재 Acceptance나 non-waived Gate에 연결된 항목을 `retired-with-reason`으로 낮출 수 없다. 완료 항목을 미완료로,
Blocker를 일반 note로, 외부 Dependency를 우리 Task로 조용히 바꾸지 않는다. reviewed·completed 문서는 원문
재작성보다 frozen source와 reviewed successor를 우선한다.

#### 13. Main Session Checklist와 TASKS Projection

Main Session Checklist는 사용자와 대화 중인 Main의 실행 상태 Projection이며 Project `TASKS.md` 정본과 별개다.
짧은 실행 작업에도 Session Checklist는 사용할 수 있지만 이것만을 이유로 `TASKS.md`를 만들지 않는다.

Project TASKS가 있으면 Session Task가 그 stable ID와 상태·Evidence를 참조한다. Project 상태에 실행 중 의미가
필요할 때만 Session에서 `in_progress`를 추가하고, Main이 결과를 검증·통합하기 전에는 Agent 완료를 Project
`passed`로 바꾸지 않는다.

```text
Project TASKS: pending | passed | blocked | deferred | cancelled
Main Session:  pending | in_progress | passed | blocked | deferred | cancelled
Native Plan:   사용자 가시성·제자리 갱신·무손실 표시 조건을 만족할 때만 Projection
```

- `in_progress`는 동시에 하나만 허용하고, 완료 수에는 `passed`만 포함한다. `failed`는 시도·검증 Event다.
- 필수 Bootstrap 뒤 첫 task-specific 행동 전에 전체 Session Task를 stable ID와 모두 pending인 상태로 한 번 공개한다.
- 같은 Native Plan을 사용자에게 보이게 제자리에서 갱신할 수 있으면 상태만 최신화한다. Native 상태가 blocked·deferred·
  cancelled 의미를 잃으면 Task label과 채팅 Delta로 보충하고, 복원이 불가능하면 Native Plan을 최신 Projection으로 쓰지 않는다.
- Task를 passed로 바꿀 때 실제 완료 결과와 검증을 최소 한 줄 보고한다. non-pass 전환은 이유·영향·재개 조건을 보고한다.
- 전체 Checklist는 매번 반복하지 않는다. 최초, 실질적 계획 변경, Session 복원·handoff·상태 drift, 최종 답변에만 Snapshot을
  다시 보여준다.
- 완료 근거를 복원하지 못한 Task는 passed로 추정하지 않고 `blocked · 상태 근거 unknown`으로 둔다.
- 상태 변화가 없는 장기 Task는 의미 있는 Checkpoint 또는 Project·Runtime 최대 무응답 간격에 Heartbeat를 보낸다.
  별도 기준이 없으면 60초다.
- `deferred`·`cancelled`를 required 분모에서 제외하려면 exact PLAN·사용자 결정 등 공식 범위 결정과 locator가 필요하다.
- Checklist 변경은 범위·권한·비용·위험 확대 승인이 아니다. 확대가 필요하면 기존 Authority Source에 따라 별도 승인받고,
  승인 전 새 Task는 `blocked`로 둔다.
- 새 사용자 요청이 기존 실행을 대체하면 남은 Task를 `cancelled`로 전환해 이유·영향·successor를 보고하고 새 stable ID의
  전체 Checklist Snapshot을 한 번 공개한다.

### EVIDENCE 공통 계약

`EVIDENCE-PRESET.md`는 복사용 비규범 scaffold다. EVIDENCE는 어떤 PLAN Criterion과 Subject revision을 실제로
관찰했고 결과·재현 방법·한계가 무엇인지 기록하며 Permission·Task 상태·PLAN 완료를 소유하지 않는다.

다음 결과를 PR·CI·Review Link나 PLAN의 짧은 locator만으로 장기 재현하기 어려울 때만 만든다.

- Benchmark·성능 비교
- Migration·Security·Recovery·Rollback 판정
- 여러 Acceptance·Gate를 묶는 검증
- Screenshot·구조화 receipt가 필요한 UI 판정
- FAIL·UNKNOWN과 관찰 한계를 함께 보존해야 하는 검증

`ai-workflow/evidence@1`은 stable evidence ID, exact `plan_ref`, Subject의 locator·revision, Criterion별
`PASS | FAIL | UNKNOWN`, evidence locator, `observed_at`, 전체 `result`, 파생 `coverage`,
`authorization_effect: none`을 보존한다.

- requiredness는 exact PLAN만 소유한다. 모든 top-level Acceptance와 non-waived Gate Criterion이 required다.
- EVIDENCE가 requiredness를 독립 Field로 낮추지 않는다. Snapshot이 PLAN과 다르거나 PLAN을 해석할 수 없으면
  `UNKNOWN | invalid`다.
- Criterion 하나라도 `FAIL`이면 전체 `FAIL`이다.
- FAIL은 없지만 required Criterion이 `UNKNOWN`·누락이면 전체 `UNKNOWN`이다.
- 모든 required Criterion이 PASS이고 FAIL이 없을 때만 전체 `PASS`다.
- `coverage: none | partial | complete`은 관찰 범위 Projection이며 네 번째 결과값이 아니다.
- `state: collecting`은 전체 `UNKNOWN`이다. closed Record를 다른 Subject·Scope로 덮어쓰지 않는다.

Evidence가 PASS여도 PLAN Owner가 required Task·Acceptance·non-waived Gate·정본 Sync를 대조하기 전에는
Delivery·Work Package가 자동 완료되지 않는다. 일반 명령 Output·Terminal 전문·raw response는 복제하지 않는다.

### Execution Packet 공통 계약

`EXECUTION-PACKET-PRESET.md`는 복사용 비규범 scaffold다. Packet은 특정 Attempt의 경계를 더 좁힐 뿐 Permission이나
사용자 승인을 새로 만들지 않는다. 다음 중 하나 이상이면 stable packet ID별 파일을 조건부로 만든다.

- 다른 Agent·사람·외부 Executor에게 실제 작업을 위임한다.
- Writer가 둘 이상이거나 Worktree·Owned Path를 나눠야 한다.
- 삭제·Migration·Secret·Permission·배포·비용 등 고위험 실행이다.
- exact Base·활성화 전 Worktree fingerprint·승인 만료를 고정해야 한다.
- Git 행동 상한이나 Stop·Recovery·Handoff를 실행 전에 결속해야 한다.

한 Session의 단일 저위험 read-only Agent이고 Runtime Permission·Project 규칙·immutable 공식 Task request만으로
대상·행동·정지선이 충분하면 `Execution Packet Trigger: not_required`와 이유를 요청에 기록하고 Packet을 생략할 수 있다.
쓰기·외부 Effect·Multi-writer·고위험·exact Base/Path/Capability 결속이 하나라도 필요하면 이 예외를 적용하지 않는다.

실제 허용 행동은 다음 교집합보다 넓을 수 없다.

```text
Parent Runtime Permission
∩ Project 공식 규칙
∩ 사용자·팀의 exact 승인
∩ Execution Packet 경계
∩ 현재 실행 범위
```

`ai-workflow/execution-packet@1`은 exact PLAN·Delivery, Base, Executor, Authorization receipt, Git 상한,
Owned/Protected Path, Capability, 검증·Stop·Recovery·Cleanup·Handoff를 보존한다.

- `issued | active` Packet은 `tasks_ref + task_ids` 또는 `official_task_request` 중 정확히 하나만 사용한다.
- `tasks_ref`는 exact revision과 non-empty·unique·resolvable stable Task ID를 요구한다.
- TASKS가 없으면 공식 Task request에 locator와 immutable revision 또는 digest를 함께 둔다.
- 두 Binding이 모두 있거나 모두 없고, Task ID가 비거나 중복·미해결이면 `invalid`로 실행하지 않는다.
- `issued → active` 전에는 Base와 전체 `preflight.worktree_fingerprint` 일치를 확인한다.
- 활성화 뒤에는 허용된 Write 때문에 전체 fingerprint 일치를 다시 요구하지 않고 Base 불변, 모든 변경이
  `authorized_delta.owned_paths` 안에 있음, Protected Path 변경 0건을 확인한다.
- Source·Base·승인·만료·Path 상태가 `stale | expired | revoked | invalid | unknown`이면 실행하지 않는다.
- `draft | issued | active | stopped | closed | revoked` lifecycle과 유효성 판정은 다른 값이다.

`Packet closed != Task passed != Evidence PASS != PLAN completed`다. 기존 Task Packet·Hybrid는 Upgrade만으로
이동·분리·재작성하지 않으며, 실제 분리는 frozen source와 무손실 mapping receipt를 요구한다.

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

감지 우선순위는 Manifest의 명시 경로, `work-status/work/**/PLAN.md` 관례, Legacy Adapter 순서다.
외부 Provider Link 없이도 파일과 Local Git만으로 기본 계획을 읽을 수 있어야 한다.

- `detected`: Source Locator를 찾았다.
- `inspectable`: Parse와 Schema 검증에 성공했다.
- `preview-editable`: Source가 Fresh하고 적용 전 문서·Git·Gate 변화를 미리 볼 수 있다.
- `apply-capable`: Preview, Permission, Gate, 명시적 사용자 승인을 모두 충족한다.

Apply 직전 Source Digest·Repository Revision·Worktree State가 Preview 시점과 달라지면 중단하고
다시 Inspect·Preview한다.
