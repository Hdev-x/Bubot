---
schema: ai-workflow/work-package@1
id: replace-with-stable-work-package-id
title: Work Package 제목
workstream: replace-with-stable-workstream-id
state: planned
updated: YYYY-MM-DD
depends_on: []
supersedes: []
outcome: 사용자가 관찰할 수 있는 결과를 한 문장으로 작성
acceptance:
  - 완료 여부를 판정할 조건
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
      - 통과 여부를 판정할 조건
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
- Task나 Evidence가 커질 때만 같은 폴더에 `TASKS.md` 또는 `EVIDENCE.md`를 추가한다.
