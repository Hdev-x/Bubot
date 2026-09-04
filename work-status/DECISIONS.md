# 확정 결정

> 사용자가 확정한 결정만 기록한다. 후보·추정·검토 중인 내용은 `OPEN-QUESTIONS.md`에 기록한다.
> 2026-09-01 이전 결정(연구·해설집·AutoTrade 시절)은 원본 저장소 `Hdev-x/Bullum`의 `docs/DECISIONS.md`에 있다.

형식:

```text
YYYY-MM-DD | D-YYYYMMDD-NN | kind | 결정 | 이유 | 영향 범위
```

- `D-YYYYMMDD-NN`: record ID. 결정이 `main`에 처음 반영된 날짜와 그날의 순번. 다른 문서·commit·PR은 이 ID로 결정을 가리킨다.
- `kind`: `durable`(제품·아키텍처·거버넌스) 또는 `operational`(운영·디자인 판정). 애매하면 `durable`.
- 결정 칸은 한 문장, 세부는 정본 링크로 대신한다.

대체 처리: 새 record를 쓰고 기존 record 말미에 `  - 대체됨: <새 ID·요지>` 포인터만 append한다.

## 결정

- 2026-09-01 | D-20260901-01 | durable | 기존 동작 코드베이스를 최종 기반으로 삼고 Portfolio Beta 범위(Desktop·Responsive Web/PWA, 로그인, 시세·차트·호가, 기본 지표·Drawing, 관심종목, 거래소 계좌 Read-only 조회)부터 점진적으로 리팩터링한다 | 별도 저장소로 전체 기능을 다시 이식하는 것보다 검증된 기능을 보존하는 편이 빠르다 | 제품 범위, 리팩터링 순서
- 2026-09-01 | D-20260901-02 | durable | Spring Boot 백엔드는 `apps/api`에 두고 Security·DB·WebSocket·시세 중계·정적 리소스를 포함한 하나의 서버 경계로 본다 | 독립 실행 프로세스가 생길 때만 별도 앱으로 분리한다 | 폴더 구조
- 2026-09-01 | D-20260901-03 | durable | Beta에서 제외한 자동매매·Paper·Backtest·관리자 계열은 삭제하지 않고 `labs/trading`에 보존한다 | 다시 실행·발전시킬 코드다 | `labs/` 경계
- 2026-09-02 | D-20260902-01 | durable | TPM 팀 프로젝트에서 넘어온 JSP 잔해(게시판·공지·뉴스·회원 MVC·주식 화면·JSP 정적 자산·모의 지갑)는 보관하지 않고 삭제한다 | Git 이력과 tag `tpm-legacy-last`(원본 저장소)로 복구 가능하고 팀 코드를 포트폴리오에 남기지 않는다 | 원본 저장소에서 100개 파일 삭제 완료, DB 테이블은 별도 승인
- 2026-09-02 | D-20260902-02 | durable | 폴더 구조는 `apps/web`·`apps/api`·`labs/trading/worker`·`shared`·`ops`로 하고, 이동은 한 commit에 한 폴더와 참조 수정만 담아 commit마다 build Gate를 통과시킨다 | 이동과 기능 분리를 섞으면 안전 지점을 확인할 수 없다 | 원본 저장소에서 이동 완료
- 2026-09-03 | D-20260903-01 | durable | 포트폴리오 제품명은 Bubot이며, 새 private 저장소 `Hdev-x/Bubot`을 만들어 정리된 트리를 첫 commit으로 시작하고 제출 시점에 public으로 전환한다 | 팀 코드·연구 자산·과거 secret 이력을 옮기지 않기 위해 이력 없이 시작한다. 이름은 포트폴리오 단계용이며 상용화 시 별도 네이밍 | 저장소, TPM 이름 rename 대상(`com.tj.app`, `TpmApplication`, `tpmApi.ts`, `tpm_token`)
- 2026-09-03 | D-20260903-02 | durable | GitHub Flow(`main` 하나 + 작업 브랜치)와 Squash and merge를 사용하고 릴리즈는 태그·GitHub Release로 관리한다. `develop`·`release`·`beta` 브랜치는 정식 출시 또는 배포판 긴급 수정 상황에만 만든다 | 배포 버전이 하나뿐인 개인 프로젝트에 맞고 `main` 이력이 PR 단위로 읽힌다 | `docs/GIT-WORKFLOW.md`, GitHub 설정(squash 전용, head 자동 삭제)
- 2026-09-03 | D-20260903-03 | operational | PR 템플릿은 목적·변경·검증·영향과 체크 2개(무관한 변경 없음, Secret·로컬 파일·산출물 없음)로 최소화하고 별도 체크리스트 문서는 두지 않는다 | 사람이 판단해야 하는 항목만 남기고 나머지는 검증 절과 GitHub 설정이 맡는다 | `.github/pull_request_template.md`
- 2026-09-03 | D-20260903-04 | operational | CI는 `pull_request`와 `main` push에서 Web test·build 2종과 API compile을 전체 실행한다. 경로 필터는 실행 시간이 10분을 넘기 시작할 때 도입한다 | 지금 규모에서는 분할 설정 비용이 절감 시간보다 크다 | `.github/workflows/ci.yml`
- 2026-09-03 | D-20260903-05 | durable | AI Workflow 0.16.2에서 문서 subset(`work-status/` 상태판·DECISIONS·OPEN-QUESTIONS·ROADMAP·planning, `AGENTS.md` 운영 규칙과 Main Session Checklist 표시, `docs/AI-STYLE.md`·`docs/DOCUMENTATION.md`)만 채택하고 CLI·`.ai-workflow/`·Agent Kit·CI/Merge Policy·local gate는 사용하지 않는다. `check-secrets.sh`는 `ops/`로 옮겨 `pre-commit` 훅에 연결한다 | 필요한 것은 현황 관리와 작업 운영 규칙이며 도구가 강제하는 구조·영수증 체계는 개인 포트폴리오에 과하다 | 템플릿 갱신은 사람이 `templates/common`을 보고 옮긴다

- 2026-09-03 | D-20260903-06 | operational | Beta 로고·앱 표시명은 현행(Botz 로고 자산)을 유지한다 | 사이트에는 로고 이미지만 노출되며 포트폴리오 단계 이름은 Bubot으로 충분하다 | OQ-20260903-05 닫음. 잔여 "Bullum" 문구 통일은 OQ-20260903-10

- 2026-09-03 | D-20260903-07 | operational | Web lint는 기계적 오류(미사용·빈 블록·prefer-const)만 즉시 고치고, `any`·React Compiler 계열 규칙·`no-useless-assignment`는 `warn` baseline으로 두어 lint를 CI에 넣는다 | 오류 345개를 한 번에 고치는 것은 며칠짜리 리팩터링이고 동작 변경 위험이 있다. CI가 새 오류를 막는 것이 우선 | OQ-03 닫음, baseline 축소는 OQ-11

- 2026-09-03 | D-20260903-08 | durable | `main`에 GitHub Ruleset `main-protection`을 적용한다 — PR 필수(squash만), force push·삭제 금지, linear history, required check(Web test · build, API test, strict), bypass 없음 | 훅·절차로 지키던 하한을 서버에서 강제한다. 이력 재작성이 필요하면 Ruleset을 잠시 비활성화한다 | OQ-01 닫음, `docs/GIT-WORKFLOW.md` 8절

- 2026-09-03 | D-20260903-09 | durable | `apps/web` 폴더 구조를 계층 우선으로 재편한다 — `app/{mobile,desktop}`(진입점·화면·앱별 CSS), `chart/`(공용 차트 스택), `api/{client,server,exchange}`(누구를 부르는가 기준), `hooks/{market,account,ui}`, `shared/`(types·constants·contexts·utils·tokens.css). 전역 `components/`는 두지 않고 공용 UI는 `chart/` 또는 `shared/ui/`. CSS는 쓰는 코드 옆, 클래스 이름은 유지 | 기능이 3개뿐이라 기능 우선(features/)보다 백엔드 계층과 같은 감각의 계층 우선이 단순하고 이동량이 작다. api는 서버 컨트롤러와 1:1 대조가 되도록 server/exchange로 나눈다 | `docs/architecture/WEB-STRUCTURE-REVIEW.md` 4절, `wp-03-web-structure`
- 2026-09-03 | D-20260903-10 | durable | `apps/web/src/chart/analysis/` 재수출 4개(chartIndicators·harmonicPattern·elliottWavePattern·pivots)는 유지한다. 루트 `shared/` 계산 엔진은 이 폴더를 통해서만 가져온다 | 5~10줄짜리지만 `../../../../../shared/...` 경로가 화면 코드에 퍼지는 것을 막는 단일 통로다. importer 8곳이 이미 이 경로를 쓴다 | `docs/PROJECT.md` 의존 방향, PR #30
- 2026-09-04 | D-20260904-01 | durable | CSS는 쓰는 컴포넌트 옆에 둔다(co-location). 앱 `styles/`에는 `:root` 토큰·reset·앱 셸만 남기고, 페이지·컴포넌트·공용 차트 규칙은 각 `.tsx` 옆 `.css`로 옮겨 그 컴포넌트가 import한다. 지표 시트처럼 두 앱이 같은 값으로 쓰는 규칙만 `chart/` 옆으로 모으고, 앱마다 다른 값(OHLC 숫자 폭·삭제 버튼 위치 등 5개)은 앱 CSS에 남긴다(OQ-20260903-12 종결) | React 관행이고, 컴포넌트를 지우면 CSS도 같이 사라져 미사용 규칙이 다시 쌓이지 않는다. `styles/`에 몰아두는 방식(A)으로 바꾸는 것은 `git mv`+import 경로 수정뿐이라 되돌리기 쉽다 | `wp-04-css-cleanup` d02~d04, `docs/architecture/WEB-CSS-REVIEW.md`
- 2026-09-04 | D-20260904-02 | durable | labs 전용 CSS(자동매매·Paper·Backtest 화면만 쓰는 규칙)는 삭제하지 않고 `labs/trading/web/src/styles/`로 옮겨 보존한다 | 모의투자 단계에서 화면을 되살릴 계획이라 코드와 CSS를 같은 곳에 둔다 | PR #34

## 대체된 결정

- 2026-09-01 | Bullum 제품명·`archive/legacy-community` 보관 → D-20260903-01·D-20260902-01로 대체됨
