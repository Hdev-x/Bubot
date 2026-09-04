# Bubot Roadmap

> 일정이나 기능 개수보다 사용자 가치와 검증 Gate를 기준으로 다음 단계로 이동한다.
> 오늘의 목표·할 일은 `CURRENT.md`가 소유한다. Track의 완료 상태 정본은 각 `work-status/work/**/PLAN.md`의 `state`다.
>
> 항목 문형 `roadmap-item@1`: `- [x]|[ ] <ID> <한 문장> | <참조>`. 참조는 `plan:<workstream>/<work-package>` 또는 `doc:<경로>` 하나.
> `[x]`는 PLAN `state: completed`이거나 `doc:` 문서가 완료를 선언할 때만 쓴다.

- 마지막 갱신: 2026-09-03 (T-03 완료)

## North Star

방문자가 시세·차트·호가를 보고 자기 거래소 계좌를 Read-only로 확인할 수 있는 Beta를 배포하고, 그 위에 봇 매매를 모의투자로 얹는다.

## 기준선 Track

- [x] T-01 원본 저장소의 정리된 코드를 폴더 단위로 가져와 `main`이 빌드된다 (PR #3~#7, 2026-09-03) | `doc:work-status/CURRENT.md`

## 정리 Track

- [x] T-02 TPM 이름을 Bubot으로 rename한다 (`com.tj.app`, `TpmApplication`, `tpmApi.ts`, `tpm_token`) | `plan:refactor/wp-01-rename-tpm`
- [x] T-03 Beta 제외 기능을 `labs`로 분리하고 필요한 코드만 남긴다 | `plan:refactor/wp-02-beta-boundary`
- T-04 로고 자산 — 현행 유지로 결정(D-20260903-06), 항목 닫음
- [x] T-04b `apps/web` 폴더 구조 재편(계층 우선 + 앱별 분리 + CSS 동반) | `plan:refactor/wp-03-web-structure`
- [x] T-04c `apps/web` CSS 정리(미사용 규칙 삭제·컴포넌트별 분리·OQ-12) | `plan:refactor/wp-04-css-cleanup`
- [ ] T-04d 큰 파일 분해 — `DesktopApp` | `plan:refactor/wp-06-desktop-app-split` · `MarketChart`·`useAutoPatterns`·`OrderPage`는 후속 WP
- [x] T-04e `web→desktop` 이름 통일(파일·식별자·빌드 이름; URL `/web`은 T-05에서) | `plan:refactor/wp-05-desktop-naming`

## Beta Track

- [ ] T-05 배포 대상을 정하고 `bootJar`로 전환한다 | `doc:work-status/OPEN-QUESTIONS.md`
- [ ] T-06 `v0.1.0-beta` 태그·Release로 Desktop·Mobile Beta를 배포한다 | `doc:docs/GIT-WORKFLOW.md`

## 모의투자 Track

- `labs`의 봇 매매 엔진을 paper trading으로 노출한다 (Beta 배포 후 PLAN 작성)

## 아이디어 보관함

- 정식 출시 시 `beta` 브랜치 신설과 `v1.0.0`
