# Bubot 문서 색인

## 진입 순서

1. [CURRENT.md](CURRENT.md) — 현재 위치, 다음 행동
2. [PROJECT.md](PROJECT.md) — 목적과 영역 경계
3. [GIT-WORKFLOW.md](GIT-WORKFLOW.md) — 브랜치·PR·merge·릴리즈·CI 규칙
4. [COMMANDS.md](COMMANDS.md) — 실행·검증 명령
5. [DECISIONS.md](DECISIONS.md) — 사용자 확정 결정
6. [ROADMAP.md](ROADMAP.md) — 장기 순서
7. [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) — 미확정 질문

## 폴더

| 경로 | 용도 |
|---|---|
| `architecture/` | 구현된 구조·흐름 설명 |
| `planning/` | Work Package 계획 규칙과 양식 |
| `work/` | 활성·완료 Work Package `PLAN.md` |
| `logs/` | 날짜별 작업·검증 기록 (`YYYY-MM-DD.md`) |
| `sql/` | DB 테이블 SQL |
| `design/` | 디자인 가이드 |

## 기록 규칙

- 현재 위치는 `CURRENT.md`, 확정 결정은 `DECISIONS.md`, 작업별 상세 상태는 `work/**/PLAN.md`가 정본이다.
- 여러 세션·Gate가 필요한 작업만 Work Package로 관리한다. 작은 수정은 PLAN 없이 PR로 처리한다.
