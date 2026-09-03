# work-status

이 프로젝트의 **현재 상태·결정·미결·로드맵·Work Package 계획** 정본이다. 목적·명령·규칙·명세 같은 정본 문서는
`docs/`가, 과정 기록(세션 로그·논의·학습)은 `.ai-workflow.local`이 가리키는 Private Worklog가 소유한다.

| 문서 | 역할 |
|---|---|
| `CURRENT.md` | 현재 목표·진행·Blocker·다음 행동 — 모든 세션의 시작점 |
| `DECISIONS.md` | 확정 결정과 이유 |
| `OPEN-QUESTIONS.md` | 아직 결정하지 않은 선택 (Small 프로필에는 없음) |
| `ROADMAP.md` | 단계·순서·큰 Gate |
| `planning/` | Planning 공통 규칙(`COMMON.md`)·프로젝트 Overlay·PLAN Template |
| `work/<short-workstream>/<wp-NN-short-name>/PLAN.md` | Work Package Outcome·Acceptance·Delivery·Gate |

개인 프로젝트에서는 이 폴더를 프로젝트 Git이 함께 추적한다. 팀 프로젝트에서는 같은 폴더가 팀 Git에서
exclude된 자체 저장소가 된다 — 구조는 같고 차이는 `docs/`를 내가 수정할 수 있는지뿐이다.
같은 상태를 CURRENT·ROADMAP·PLAN에 반복하지 않고 정본 한 곳을 링크한다.
