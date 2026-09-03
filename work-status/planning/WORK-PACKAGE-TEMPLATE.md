---
schema: ai-workflow/work-package@1
id: wp-01-short-name
title: Work Package 제목
workstream: short-workstream-id
state: planned
updated: YYYY-MM-DD
depends_on: []
supersedes: []
outcome: 사용자가 관찰할 수 있는 결과를 한 문장으로 작성
acceptance:
  - "AC-001: 완료 여부를 판정할 조건"
deliveries:
  - id: replace-with-delivery-id
    title: 독립적으로 반영할 결과
    kind: git
    state: planned
    repository: .
    depends_on: []
    branch: null
    pull_requests: []
    evidence: []
milestones:
  - id: replace-with-gate-id
    title: 다음 단계 진입 Gate
    state: pending
    depends_on: []
    acceptance:
      - "GATE-AC-001: 통과 여부를 판정할 조건"
    unlocks: []
    evidence: []
extensions: {}
---

# Work Package 제목

## 범위

포함:

- <포함 범위>

제외:

- <제외 범위>

## Delivery Notes

### replace-with-delivery-id

- 주요 Task:
- 추가 Gate:
- Blocker·재개 조건:

## Milestone Notes

- Frontmatter의 Milestone `acceptance·evidence`가 판정 정본이다.
- 통과하지 못한 조건과 재검증 방법:

## 관련 정본

- <정본 Link>

## 운영 메모

- 일일 과정과 Tool Output은 PLAN이 아니라 Private Worklog에 기록한다.
- 정식 identity는 `<workstream>/<id>` 쌍이다. `NN`은 Priority가 아닌 고정 번호이며 활성화 뒤 폴더를 Rename·재번호하지 않는다.
- 모든 top-level Acceptance와 non-waived Gate Criterion은 required다. EVIDENCE나 Overlay가 이를 낮추지 않는다.
- `Packet closed != Task passed != Evidence PASS != Delivery completed != Work Package completed`다.
