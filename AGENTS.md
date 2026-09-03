# Bubot AI 작업 규칙

## 세션 시작

1. `docs/CURRENT.md`를 읽는다.
2. `git status --short --branch`와 원격 기준 시점을 확인한다.
3. `docs/PROJECT.md`, `docs/GIT-WORKFLOW.md`, `docs/COMMANDS.md`, `docs/DECISIONS.md`를 읽는다.
4. CURRENT가 활성 Work Package를 가리키면 `docs/work/**/PLAN.md`를 읽는다.
5. 현재 위치와 다음 행동 하나를 짧게 보고하고, 문서와 실제 상태가 다르면 작업 전에 알린다.

## 정본과 경계

- 목적·영역은 `docs/PROJECT.md`, 현재 위치는 `docs/CURRENT.md`, 확정 기준은 `docs/DECISIONS.md`, Git 규칙은
  `docs/GIT-WORKFLOW.md`를 따른다.
- `apps/`·`shared/`는 `labs/`를 import하지 않는다. `labs/`와 `ops/verify/`는 `shared/`를 import할 수 있다.
- 트레이딩 기준·전략·지표 선택은 사용자가 결정한다. AI가 새 기준을 만들거나 확정하지 않는다.
- 사용자의 명시적 변경 요청은 그 범위의 수정 승인이다. 조사·평가·질문에서는 파일을 수정하지 않는다.
- 미커밋 변경은 사용자 작업으로 보고 임의로 수정·복원하지 않는다.
- 요청 범위 밖 아이디어는 구현하지 않고 `docs/OPEN-QUESTIONS.md` 반영 여부만 제안한다.

## 위험 작업

- 실계좌·실주문·과금 API 호출, 워커(`ops/worker.sh`) 기동은 예외 없이 사용자 사전 승인을 받는다.
- DB 삭제·migration, 배포, 태그·Release 생성, `.env`·properties 수정, credential 변경, force push·이력 변경은 별도 승인을 받는다.
- commit 전 staged diff·Secret·대상 브랜치를 확인한다.

## 작업 기록

- 구현·문서 변경 작업은 시작 전 목표·대상·완료 기준을 `docs/logs/YYYY-MM-DD.md`에 짧게 적고, 완료 후 변경 파일·검증·미검증을 같은 항목에 적는다.
- 읽기 전용 조사·단순 질문만 한 세션에는 로그를 만들지 않는다.
- 확정 결정은 `docs/DECISIONS.md`, 미확정은 `docs/OPEN-QUESTIONS.md`에 둔다.

## 검증과 Git

- 실행하거나 원문을 확인한 것만 `확인했다`고 표현한다. 실행하지 않은 검증은 완료로 쓰지 않는다.
- Gate는 `docs/COMMANDS.md`의 명령과 CI 결과를 사용한다. baseline `--update`는 별도 승인 항목이다.
- 브랜치·PR·merge·릴리즈는 `docs/GIT-WORKFLOW.md`를 따른다. `main` 직접 push는 `.githooks/pre-push`가 막는다.

## 세션 종료

실제 변경이 있으면 변경 파일과 검증 결과를 보고하고, 상태가 바뀌었으면 `docs/CURRENT.md`와 활성 `PLAN.md`를 갱신하고, 다음 세션의 첫 행동을 하나 남긴다.
