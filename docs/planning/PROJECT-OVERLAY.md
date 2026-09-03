# Bubot 작업 계획 보강 규칙

- 적용 Core: [COMMON.md](./COMMON.md)
- 계획 Schema: `ai-workflow-planning@1`
- 공식 저장소: `Hdev-x/Bubot` (`repository: .`)
- 작업 기록: `docs/logs/YYYY-MM-DD.md`

## 1. 공식 Source 우선순위

1. 사용자 확정 요청
2. `AGENTS.md`와 [Git 규칙](../GIT-WORKFLOW.md)
3. [PROJECT](../PROJECT.md)·[DECISIONS](../DECISIONS.md)·[COMMANDS](../COMMANDS.md)
4. 이 Overlay와 Planning Core
5. 활성 Work Package의 `PLAN.md`

현재 Workstream ID는 `refactor`, `product`다.

## 2. Git Delivery

- Delivery의 `kind: git`은 `main` 대상 PR 하나에 대응하고 Squash and merge로 닫는다.
- Delivery Gate는 `docs/COMMANDS.md`의 명령과 CI 결과로 판정한다.
- 실계좌·배포·DB 변경이 포함된 Delivery는 실행 전 사용자 승인을 Evidence로 남긴다.
