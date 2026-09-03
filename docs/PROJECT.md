# Bubot 프로젝트 경계

## 목적

- 암호화폐 시세·차트·호가를 조회하고 거래소 계좌를 Read-only로 확인하는 Portfolio Beta를 배포한다.
- 봇 매매 엔진(하모닉·SMC·ABCD)은 `labs`에 보존하고, 이후 모의투자 기능으로 제공한다.

## 주요 영역

| 영역 | 경로 | 역할 |
|---|---|---|
| API | `apps/api/` | Spring Boot·MyBatis·PostgreSQL. 인증, 시세 프록시·WebSocket 중계, 계좌 조회 |
| Web | `apps/web/` | React·TypeScript·Vite. Mobile(`/mobile`)·Desktop(`/web`) UI |
| Shared | `shared/` | 하모닉·SMC·파동·피벗 순수 계산 엔진. Web과 Worker가 함께 사용 |
| Labs | `labs/trading/worker/` | Node 봇 매매·모니터링 워커. Beta에서는 비활성 |
| Ops | `ops/` | 배포·기동 스크립트, `ops/verify/` 회귀 검사와 baseline fixtures |

## 문서 정본

- 현재 위치와 다음 행동: `docs/CURRENT.md`
- 사용자 확정 기준: `docs/DECISIONS.md`
- Git 규칙: `docs/GIT-WORKFLOW.md`
- 실행·검증 명령: `docs/COMMANDS.md`
- 장기 순서: `docs/ROADMAP.md`
- 미확정 질문: `docs/OPEN-QUESTIONS.md`

## 기술

- Java 21, Spring Boot 3.5, MyBatis, PostgreSQL
- React, TypeScript, Vite, Vitest
- Node.js(TypeScript, `--experimental-strip-types`)

## 안전 경계

- 실계좌·실주문·과금 API 호출은 항상 사용자 사전 승인 대상이다.
- DB 삭제·migration, 배포, `.env` 수정, credential 변경은 별도 승인 없이 수행하지 않는다.
- Secret은 `.env`·`application*.properties`(gitignore)에만 두고 코드·문서·로그에 쓰지 않는다.

## 출처

- 원본 저장소 `Hdev-x/Bullum`(private)의 2026-09-03 `develop`에서 정리된 트리를 가져와 시작했다.
  이력·연구 자산·TPM 팀 프로젝트 잔해는 가져오지 않았다.
