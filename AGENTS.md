# Bubot AI 작업 규칙

## 세션 시작

1. `work-status/CURRENT.md`를 먼저 읽는다. 현재 목표·TODO·활성 Work Package·Blocker·읽기 안내를 담은 상태판이다.
2. Git 브랜치와 미커밋 변경을 확인하고, 문서와 다르면 작업 전에 차이를 알린다. 실제 코드·Git·실행 결과를 규칙 정본보다,
   규칙 정본을 CURRENT보다 우선해 사실 기준으로 삼고 CURRENT 동기화 필요를 보고한다.
3. CURRENT가 활성 Work Package를 가리키면 해당 `work-status/work/**/PLAN.md`를 읽고 현재 Delivery·Gate를 확인한다.
4. 이번 작업 유형에 해당하는 문서만 CURRENT의 `읽기 안내`에 따라 읽는다. 일괄 필독은 하지 않는다.
5. Secret·DB·배포·실계좌·워커 기동·Auth·Security·Release 같은 고위험 범주가 감지되면 `docs/DOCUMENTATION.md`의
   `고위험 영역 정본 위치`에서 해당 정본을 찾아 읽고 시작한다.
6. `.ai-workflow.local`이 있으면 연결된 Private Worklog의 `README.md`와 최신 세션 Log 한 개를 읽는다.
   Worklog는 현황을 소유하지 않는다. 현황 정본은 `work-status/CURRENT.md` 하나다.
7. 현재 목표, TODO 최상단, 활성 Work Package와 Blocker를 짧게 보고한다.

### Main Session 작업 표시

- 파일·문서·설정 조사·변경, 명령·검증·Git·외부 Source 확인, 여러 판단이 이어지는 제안 작업에는 Main Session
  Checklist를 사용한다. 도구가 필요 없는 짧은 질의응답·요약·선택지 설명에는 만들지 않는다.
- 규칙·CURRENT·Git·활성 PLAN·고위험 정본을 읽는 Bootstrap을 먼저 마친다. 첫 task-specific Read·Write·Command·외부 조회
  전에 전체 Task를 stable ID와 모두 `pending`인 상태로 한 번 공개한다. 한 단계 실행도 `T1` 하나로 표시하며 Checklist를
  위해 불필요하게 분해하지 않는다.
- 사용자 표시 문형은 `docs/AI-STYLE.md`의 `작업 Checklist와 진행 브리핑`을 따른다. Task ID와 상태는 inline code로 표시한다.
- Canonical 상태는 `pending | in_progress | passed | blocked | deferred | cancelled`다. `in_progress`는 동시에 하나만,
  완료 수에는 `passed`만 포함한다. `failed`는 시도·검증 Event이며 진행 불가가 확정될 때 `blocked`로 바꾼다.
- Task를 `passed`로 바꿀 때 무엇을 끝냈고 어떤 검증을 충족했는지 최소 한 줄 보고한다. non-pass 전환은 이유·영향·
  다음 행동 또는 재개 조건을 보고한다.
- 상태 변화가 없는 장기 Task는 의미 있는 Checkpoint 또는 60초 무응답마다 Heartbeat를 보낸다. 새 Evidence가 없으면
  진행된 것처럼 표현하지 않는다.
- 전체 Snapshot은 최초 공개, 실질적 계획 변경, 세션 복원·상태 drift, 최종 답변에만 다시 보여준다. 완료 근거를 복원하지
  못한 Task는 `passed`로 추정하지 않고 `blocked · 상태 근거 unknown`으로 둔다.
- `deferred`·`cancelled`로 required 분모를 줄이려면 PLAN·사용자 결정 등 공식 범위 결정이 필요하다. 새 요청이 기존 작업을
  대체하면 남은 Task를 `cancelled`로 표시하고 새 Checklist Snapshot을 공개한다.

### 세션 기록

- 문서의 정본·수명주기와 Private Worklog 경계는 `docs/DOCUMENTATION.md`를 따른다.
- 설계·조사·구현·문서화처럼 여러 결정이 이어지는 세션에는 Worklog가 연결돼 있을 때 세션 Log에 Checkpoint를 append한다.
  범위 확정, 사용자 결정, 방향 변경, 구현·검증 완료, Blocker, Commit·PR·Merge와 종료를 기록하고 단순 질의응답은 제외한다.
- Worklog가 없는 동안에는 commit·PR 본문이 과정 기록을 대신한다.

## 작업

- 공통 작업 규칙(승인·범위·기존 변경 보호)은 각 도구의 전역 설정이 소유한다.
- 사용자의 명시적인 변경 요청은 요청 범위의 수정 승인으로 간주한다. 조사·평가·질문에서는 파일을 수정하지 않는다.
- 기존 미커밋 변경은 사용자 작업으로 보고 임의로 수정·복원하지 않는다.
- 확정 결정은 `work-status/DECISIONS.md`를 따른다. 미확정 질문을 AI가 임의로 결정하지 않는다.
- 요청 범위를 벗어난 작업은 수행하지 않고 필요하면 `work-status/OPEN-QUESTIONS.md` 반영을 짧게 제안한다.
- 트레이딩 기준·전략·지표 선택은 사용자가 결정한다. AI가 새 기준을 만들거나 확정하지 않는다.
- `apps/`·`shared/`는 `labs/`를 import하지 않는다. `labs/`와 `ops/verify/`는 `shared/`를 import할 수 있다.
- 프로젝트 규칙은 전역 안전·권한·보안 하한을 완화하지 않는다.

## 위험 작업

- 실계좌·실주문·과금 API 호출, 워커(`ops/worker.sh`) 기동은 예외 없이 사용자 사전 승인을 받는다.
- DB 삭제·migration, 배포, 태그·Release 생성, `.env`·properties 수정, credential 변경, force push·이력 변경은 별도 승인을 받는다.

## 검증

- 실행하거나 원문을 확인한 것만 `확인했다`고 표현한다. 검증하지 못한 항목은 완료로 표현하지 않는다.
- Gate는 `docs/COMMANDS.md`의 명령과 CI 결과를 사용한다. baseline `--update`는 별도 승인 항목이다.

## 작업 계획

- 여러 PR·세션 또는 명확한 Gate가 필요한 큰 작업은 `work-status/planning/COMMON.md`와 `PROJECT-OVERLAY.md`를 적용하고
  `work-status/work/<short-workstream>/<wp-NN-short-name>/PLAN.md`를 Outcome·Acceptance·Delivery·Gate 정본으로 둔다.
- Workstream·Work Package에 장기 Branch를 만들지 않는다. Delivery를 독립 Branch·PR 단위로 실행한다.
- PR Merge를 Delivery·Work Package 완료나 Release로 자동 해석하지 않는다. Acceptance·Gate·Evidence와 정본 Sync까지
  확인한 뒤 상태를 변경한다.
- 작은 단독 수정은 PLAN 없이 Fast Path로 처리한다.

## Git

- 브랜치·commit·PR·merge·릴리즈는 `docs/GIT-WORKFLOW.md`를 따른다. GitHub Flow, `main` 대상 PR, Squash and merge, 태그 릴리즈.
- 사용자가 작업을 승인하면 같은 범위의 브랜치 생성, 수정, 검증, 로컬 commit, push, PR 생성까지 수행할 수 있다.
  `main` 반영(merge)은 사용자 승인 뒤 수행한다.
- commit 전 상태·전체 diff·staged diff를 확인하고 관련 파일만 포함한다. `.githooks/pre-commit`이 staged secret을 검사하고
  `.githooks/pre-push`가 `main` 직접 push를 막는다. 훅 우회는 하지 않는다.
- 복구는 새 수정 commit 또는 revert PR을 우선하며 DB·배포·사용자 Data 복구는 별도 승인받는다.

## 세션 종료

commit·merge 또는 정본 수정이 있었던 세션은 종료 시 다음을 수행한다. 변경이 없는 조사·질문 세션은 생략한다.

1. 변경 파일과 검증 결과를 보고한다.
2. 활성 Work Package가 있으면 PLAN의 Delivery·Gate·Evidence를 실제 결과와 Sync한다.
3. `work-status/CURRENT.md`의 현재 목표·TODO·활성 Work Package·Blocker를 갱신한다. 완료한 TODO는 지우고 최상단이
   다음 세션의 시작점이다.
4. 새로 확정된 결정만 `work-status/DECISIONS.md`에, 미확정 사항은 `work-status/OPEN-QUESTIONS.md`에 기록한다.

## 답변

- 공통 대화 원칙은 각 도구의 전역 설정이 소유한다. `docs/AI-STYLE.md`를 프로젝트 공통 스타일로 적용한다.
