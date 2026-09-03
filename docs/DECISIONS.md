# Bubot 확정 결정

> 사용자가 확정한 기준만 기록한다. 미확정 사항은 `OPEN-QUESTIONS.md`에 둔다.
> 2026-09-01 이전 결정(연구·해설집·AutoTrade 시절)은 원본 저장소 `Hdev-x/Bullum`의 `docs/DECISIONS.md`에 있다.
> 형식: `날짜 | **결정** | 배경·범위`

## 2026-09-01 Bullum Portfolio Beta 전환

- 2026-09-01 | **제품명과 GitHub 저장소명을 Bullum으로 변경하고, 로컬 최상위 폴더명은 현재 세션과
  도구 연결을 위해 당분간 `AutoTrade`로 유지한다** | 제품 표기와 저장소 identity를 먼저 전환하되 로컬
  경로 변경은 폴더 리팩터링과 분리한다. 과거 로그·운영 도메인·환경변수·내부 호환 식별자는 역사와 실행
  호환성을 위해 일괄 치환하지 않는다.
- 2026-09-01 | **기존 동작 코드베이스를 Bullum의 최종 기반으로 삼고 Portfolio Beta 범위부터 점진적으로
  리팩터링한다** | Beta는 Desktop·Responsive Web/PWA, 로그인, 공개 시세·차트·호가, 기본 지표·Drawing,
  관심종목, 거래소 계좌 Read-only 조회를 포함한다. 자동매매·Paper Trading·Community·Push·관리자 기능은
  즉시 삭제하지 않고 Beta 실행 경로에서 비활성화한다. 별도 Botz 저장소로 전체 기능을 다시 이식하지 않는다.

## 2026-09-02 Git 전달 경계와 폴더 이동 방식

- 2026-09-02 | **`develop` 미병합 이력은 연구 기준선 PR과 Beta 리팩터링 PR로 나눠 통합하고, 둘 다 squash 없이
  merge commit으로 병합한다** | 연구 이력 808개(`7d2ceeb9..c35b5097`)는 `integration/research-baseline` → `develop`
  PR #13이 맡는다. `docs/CURRENT.md` 등이 개별 commit hash를 증거로 참조하므로 squash·rebase로 hash를 바꾸지 않는다.
  stacked PR #1~#12는 #13으로 대체해 닫는다. 연구 자산은 Beta 배포와 무관하므로 저장소에 그대로 두고, 별도 저장소
  분리·대용량 파일 정리는 이동·정리 이후 별도 Work Package로 미룬다.
- 2026-09-02 | **폴더 구조 이동은 되돌린 `refactor/runtime-layout-clean`에서 처음부터 다시 하되, 한 commit에 한 폴더
  이동과 참조 수정만 담고 commit마다 build·test Gate를 통과시킨다** | 2026-09-01의 `refactor/bullum-beta`는 이동과 기능
  분리가 한 branch에 섞여 안전 지점을 확인하기 어려웠다. 이동이 끝난 뒤에 불필요한 기능을 `labs`·`archive`로 분리하고
  필요한 코드만 남기는 리팩터링을 별도 Work Package로 진행한다. `refactor/bullum-beta`는 참고용으로 보존한다.
- 2026-09-02 | **TPM 팀 프로젝트에서 넘어온 JSP 잔해(게시판·공지·뉴스·회원 MVC·주식 화면·JSP 정적 자산)는 archive로
  보관하지 않고 삭제한다** | 2026-09-01의 `archive/legacy-community` 보관 결정을 이 범위에 한해 대체한다. Git 이력과
  tag `tpm-legacy-last`로 복구 가능하며, 팀 프로젝트 코드를 개인 포트폴리오 트리에 남기지 않는다. React가 호출하는
  `/api/**` REST, market service, security는 유지한다. DB 테이블은 코드 정리와 분리해 별도 승인으로 다룬다.
  잔해 정리를 폴더 이동보다 먼저 수행한다.

## 2026-09-03 포트폴리오 이름과 새 저장소

- 2026-09-03 | **포트폴리오용 제품명은 Bubot으로 하고, 새 private 저장소를 만들어 코드 리팩터링을 거기서 진행한다** |
  Bullum(2026-09-01)을 대체한다. 포트폴리오 단계 이름이며 상용화 시 별도 네이밍한다. 사이트에는 로고 이미지만 노출되고
  이름 텍스트는 들어가지 않으므로 UI 변경은 로고 자산 교체로 한정한다. 새 저장소는 정리된 현재 트리를 첫 commit으로 시작해
  TPM 코드·연구 자산·과거 secret 이력을 옮기지 않으며, 제출 시점에 public으로 전환한다. 현재 저장소(`Hdev-x/Bullum`,
  로컬 `AutoTrade`)는 연구 자산과 이력 보관용 private로 유지한다. Java 패키지·`TpmApplication`·`tpmApi.ts` 등 TPM 이름
  rename은 새 저장소의 리팩터링 Work Package에서 Bubot 기준으로 수행한다.

## 2026-09-03 Git 규칙

- 2026-09-03 | **GitHub Flow(`main` 하나 + 작업 브랜치)와 Squash and merge를 사용하고, 릴리즈는 태그·GitHub Release로
  관리한다** | `develop`·`release`·`beta` 브랜치는 두지 않는다. 정식 출시로 정식과 다음 버전 베타를 동시 운영해야 할 때
  `beta` 브랜치를, 배포 태그에 긴급 수정이 필요한데 `main`이 앞서 있을 때만 `release/x.y.x`를 임시로 만든다.
  상세는 `docs/GIT-WORKFLOW.md`.
- 2026-09-03 | **PR 템플릿은 목적·변경·검증·영향과 체크 2개(무관한 변경 없음, Secret·로컬 파일·산출물 없음)로 최소화한다** |
  나머지 확인은 검증·영향 절과 GitHub 설정(squash 전용, `main` 훅)이 맡는다. 별도 체크리스트 문서는 두지 않는다.
- 2026-09-03 | **CI는 `pull_request`와 `main` push에서 Web test·build 2종과 API compile을 전체 실행한다** | 경로 필터는
  실행 시간이 10분을 넘기 시작할 때 도입한다. Web lint는 기존 오류를 정리한 뒤 CI에 추가한다.
