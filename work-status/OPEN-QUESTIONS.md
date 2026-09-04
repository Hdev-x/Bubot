# 미확정 질문

- 마지막 갱신: 2026-09-03 (OQ-05 닫음, OQ-04 후보 갱신, OQ-10 추가)

> 아직 결정하지 않은 사항과 사용자 확인이 필요한 내용을 기록한다. AI가 임의로 확정하지 않는다.
> 해결된 질문은 이 문서에서 제거하고, 닫는 commit·PR 본문에 `OQ-YYYYMMDD-NN → D-YYYYMMDD-NN`을 적는다.
>
> 문형: `- 질문: OQ-YYYYMMDD-NN <결정할 한 문장> | <관련 링크(선택)>`

## Git·CI

## 배포·제품

- 질문: OQ-20260903-04 Beta 배포 대상 — EC2는 꺼져 있고 후보는 (a) Intel iMac 홈 서버 + Docker Compose + Cloudflare Tunnel(도메인 구입 필요) 또는 Duck DNS(`autotradev.duckdns.org`) + 포트포워딩, (b) AWS Lightsail 서울 2GB(월 약 $7). 도메인 구입 여부와 `DB_URL`이 가리키는 PostgreSQL 위치가 정해지면 `wp-03` PLAN | `work-status/ROADMAP.md`

## 막지는 않음

- 질문: OQ-20260904-01 `mobile.css`·`desktop.css` 셸에 같은 선택자 90개가 남아 있다. 대부분 Desktop이 Mobile 호가창(`TradeOrderbook`) 규칙을 다른 값으로 덮는 override(`book-row`·`funding-rate-countdown`·`gauge-*` 등 10개 계열)와 `.up/.down` 같은 양 앱 공용 규칙이다. Desktop override를 `WebApp.css`로 옮겨 명시할지, 값을 통일할지(디자인 판단) | `wp-04-css-cleanup` Milestone 잔여

- 질문: OQ-20260903-11 lint warning baseline 320개(`no-explicit-any` 145, `react-hooks/refs` 82, `set-state-in-effect` 44, `no-useless-assignment` 8 등)를 어느 WP에서 줄이고 언제 `error`로 올릴지 | `apps/web/eslint.config.js`

- 질문: OQ-20260903-10 코드·문구에 남은 "Bullum"(`apps/web/package.json` name, `document.title`, 푸터)을 Bubot으로 통일할지 | D-20260903-06

- 질문: OQ-20260903-09 `apps/web/.env`의 `VITE_BOT_API_TOKEN`이 브라우저 번들에 노출되는 값인데 Beta에서 계속 프론트에 둘지, 서버 프록시(`/api/bot`)로만 쓰고 제거할지 | `apps/web/src/api/botApi.ts`

- 질문: OQ-20260903-08 `apps/api/src/main/resources/static/{web,index.html}`에 추적된 Desktop build 산출물을 Git에서 빼고 배포 시 생성할지, 아니면 계속 추적할지 (현재 bundle은 rename 전 `tpm_token`을 포함) | `work-status/work/refactor/wp-01-rename-tpm/PLAN.md`

- 질문: OQ-20260903-06 `MemberDTO.cash`(주식 예수금)·`members` 컬럼과 미사용 legacy DB 테이블을 언제 정리할지 (DB 변경 승인 필요)
- 질문: OQ-20260903-07 Private Worklog를 원본 저장소 worklog에 이어 쓸지 Bubot용으로 새로 만들지
