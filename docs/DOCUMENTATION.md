# 문서 운영과 수명주기

이 문서는 Project Repository와 Private Worklog 사이의 기록 경계, 문서 정본, 수명주기와 세션 종료 시 승격 절차를 정의한다.

## 기본 원칙

> Project Repository에는 현재 사실·공식 결정·계약·Evidence를 남기고, Private Worklog에는 그 결론에 도달한 세션 과정과
> 개인 학습을 남긴다.

- Project 문서는 다른 사용자와 AI가 현재 상태를 이해하고 같은 결과를 재현하기 위한 정본이다.
- 같은 내용을 여러 문서에 복제하지 않고 정본 한 곳에 기록한 뒤 다른 문서에서는 링크한다.
- 과거 Log는 당시 기록으로 보존하며 현재 상태처럼 다시 쓰지 않는다.
- 문서와 실제 Git·Code·PR 상태가 다르면 사실을 먼저 확인하고 운영 정본을 Sync한다.

Project Repository 안에서도 소유권에 따라 두 폴더로 나눈다. `docs/`는 목적·명령·규칙·명세 같은 **정본 문서**,
`work-status/`는 현재 상태·결정·미결·계획의 **작업 현황**이다. 과정 기록은 Private Worklog가 소유한다. 팀 프로젝트도
같은 3구조이며 차이는 `docs/`를 내가 수정할 수 있는지뿐이다.

## 문서 상태와 역할

문서의 `상태`와 `정본 역할`은 서로 다르다.

- 상태: `draft`(검토 중, 확정 근거 아님) · `active`(현재 사용) · `closed`(완료 기록, 동결) · `superseded`(더 최신 문서가
  대체, 대체 문서 연결) · `archived`(현재 운영에서 읽지 않는 역사 자료)
- 정본 역할: `canonical`(현재 상태·승인된 결정·계약) · `evidence`(재현 가능한 근거) · `derived`(정본에서 만든 요약·Projection) ·
  `log`(시간순 기록) · `reference`(비교·역사 확인용)

현재 상태를 오인할 가능성이 있는 Draft·Handoff·Historical 문서에는 다음 Metadata를 우선 적용한다. 모든 문서에 강제하지 않는다.

```yaml
status: draft | active | closed | superseded | archived
authority: canonical | evidence | derived | log | reference
updated:
superseded_by:
```

## Project Repository에 기록할 것

- 현재 목표·TODO·Deferred·활성 Work Package·완료된 Work Package 링크·Blocker: `work-status/CURRENT.md`
- 승인된 결정과 이유: `work-status/DECISIONS.md` (`D-YYYYMMDD-NN` record)
- 실제로 남은 선택·질문: `work-status/OPEN-QUESTIONS.md` (`OQ-YYYYMMDD-NN` record)
- 장기 방향과 Gate: `work-status/ROADMAP.md` (`roadmap-item@1`)
- Work Package Outcome·Acceptance·Delivery·Gate: `work-status/work/<short-workstream>/<wp-NN-short-name>/PLAN.md`
- Project 목적·범위·기술 결정·작업 경계: `docs/PROJECT.md`
- 실제 검증한 명령: `docs/COMMANDS.md`
- 구현 계약·명세(프로젝트에 따라 `docs/architecture/`·`docs/*_SPEC.md` 등)

## 고위험 영역 정본 위치

Risk Trigger 감지 시 이 지도에서 해당 영역 정본을 찾아 읽는다.

| 영역 | 정본 |
|---|---|
| Architecture·Data·Schema Contract | `docs/PROJECT.md` 주요 영역 · `docs/architecture/` · `docs/sql/` |
| Auth·Permission·Security·Network | `docs/PROJECT.md` 안전 경계 · `apps/api` `common/security` |
| Dependency·CI·Git Governance | `docs/GIT-WORKFLOW.md` · `docs/COMMANDS.md` |
| Release·배포·Migration | `docs/GIT-WORKFLOW.md` 5절 · `ops/deploy.sh` |
| 실계좌·거래소 API·워커 기동 | `docs/PROJECT.md` 안전 경계 · `AGENTS.md` 위험 작업 |

이 지도가 Trigger 영역 정본 위치의 완전 목록 소유자다.

## 규칙 수명주기

- 규칙·계약을 바꾸면 소유 정본과 파생 문서·생성물·Validator를 같은 작업에서 함께 갱신한다.
- 새 규칙을 추가할 때 발생 배경(Incident·Risk), 소유 문서, 대체하는 기존 규칙, 기계화(hook·CI·script) 가능 여부를 함께 기록한다.
- 다음 중 하나면 규칙을 축소·폐기한다: 다른 정본이 소유한다 / 기계 강제가 모든 경로를 커버한다 / 더 이상 적용되지 않는다 /
  상위 원칙에 완전히 포함된다.
- AI 작업 규칙(`AGENTS.md`·이 문서·`work-status/planning/`)의 기준선은 AI Workflow 0.16.2 템플릿의 문서 subset이다
  (D-20260903-05). 템플릿이 바뀌면 사람이 `templates/common`을 보고 필요한 부분만 옮긴다.

## Planning 문서 경계

- 전체 방향·Track 순서·큰 Gate는 `work-status/ROADMAP.md`가 소유한다.
- 현재 활성 PLAN·Delivery·Blocker·다음 행동은 `work-status/CURRENT.md`가 가리킨다.
- Work Package의 범위·상태·Acceptance·Delivery·Milestone은 해당 `PLAN.md`가 정본이다.
- PLAN은 일일 Log나 Tool Output을 누적하지 않는다. 과정은 Private Worklog, 실행 명령 정본은 `docs/COMMANDS.md`에 둔다.
- 결정은 `D-YYYYMMDD-NN`, 미결 질문은 `OQ-YYYYMMDD-NN` ID로 서로 가리킨다. 질문을 닫는 commit·PR 본문에 `OQ → D`를 적는다.

## Private Worklog에 기록할 것

`.ai-workflow.local`이 연결한 `private_worklog` 아래에 기록한다.

- 세션별 대화와 판단 흐름의 구조화된 요약(세션 Log Checkpoint)
- Agent를 돌려 얻은 조사·리뷰 원문과 중간 증거·제안서 초안(`discussions/`)
- 사용자 요구와 AI 제안의 구분, 유력 후보, 폐기·대체된 안과 그 이유
- 구현 중 시행착오와 Tool·Sandbox·인증 문제, 개인 학습·회고·면접 소재
- Project 문서 승격 후보. 승격 후에도 과정 기록은 Worklog에 남기고 Project에는 판정·계약만 둔다

세션 Log는 채팅 전문이나 Tool Output 전체를 복제하지 않는다. 본문만으로 `무엇·왜·결과·영향·다음 행동`을 이해할 수 있어야
한다. 형식은 Worklog `README.md`가 소유한다.

## 기록하지 않을 것

Project Repository와 Private Worklog 모두 다음 내용을 저장하지 않는다.

- API key, Token, Password, Cookie와 Secret
- 개인정보(실명·연락처·주소·생년월일), 비공개 Source·Production Data·Runtime Log 원문
- credential·민감 query가 포함된 URL과 인증된 Thread의 비공개 원문

사용자 발언은 기본적으로 요약하고 표현 자체가 결정 근거일 때만 필요한 최소 문장을 인용한다. 기존 기록에서 Secret·개인정보를
발견하면 일반 정정으로 처리하지 않고 작업을 멈춰 보고하며, 노출된 자격증명은 폐기·회전한다.

## Main 직접 세션 기록 루틴

설계·조사·구현·문서화처럼 여러 결정과 변경이 이어지는 세션에는 Main이 완성한 Checkpoint를 existing exact Worklog
target에 직접 append한다. 별도 Scribe Agent·Global `log-write` profile·Provider hook·watcher·background process를 사용하지 않는다.

1. Main은 세션 제목·범위·현재 상태 정본과 필요한 주제별 맥락을 확인한다.
2. 목표·범위 확정, 사용자 명시 결정, 방향 변경과 기존 안 폐기, 구현 단위 완료, 검증 결과와 Blocker, Commit·PR·Merge,
   세션 종료 시점에 Checkpoint를 완성한다. 생략하면 후속 Agent가 결정·상태·검증·다음 행동을 잘못 이해할 사건만 기록한다.
3. Checkpoint는 `HH:MM [종류] 제목` · 설명 1~3문장 · typed 핵심 내용(사용자 결정·확인된 사실·AI 제안·추정·미결) · 참조로
   쓰고 target 끝에만 추가한다. 기존 내용을 교체·정렬·요약하지 않으며 사실 오류는 새 `[정정]` Checkpoint로 남긴다.
4. 실행 전후 target identity·size·digest·bytes와 Worklog status를 비교해 old bytes가 완전한 prefix이고 증가분이 exact
   Checkpoint뿐인지 확인한다. 불일치나 target 외 변경이 있으면 결과를 무효화한다.
5. 사용자 합의를 확인한 결과만 Project 정본에 승격한다. Agent 간 합의나 후보를 사용자 확정으로 기록하지 않는다.

## 승격 흐름

```text
Private Session Log
→ 사실·결정·후보·검증·미결 분류
→ 사용자 합의 확인
→ Project 정본에 필요한 결과만 승격 (결정 → DECISIONS · 현황 → CURRENT · 미결 → OPEN-QUESTIONS · 계약 → docs/)
→ Session Log 종료
```

Main이 승격 후보를 판정하며 Worklog 기록만으로 Product 결정을 확정하거나 공용 정본에 자동 반영하지 않는다.

## Merge와 세션 종료 Sync

- 장기 문서에는 현재 Branch·일시적인 PR 상태를 복제하지 않는다.
- Merge로 기존 `CURRENT·ROADMAP·OPEN-QUESTIONS`가 낡으면 다음 작업보다 문서 Sync를 먼저 한다.
- 종료 시 해결된 질문을 제거하고 `TODO`를 우선순위 순으로 갱신해 남긴다.
- Project Repository와 Private Worklog는 각각의 Git 규칙에 따라 별도로 검증·Commit·Push한다.
