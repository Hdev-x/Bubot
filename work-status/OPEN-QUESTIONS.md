# 미확정 질문

- 마지막 갱신: 2026-09-03

> 아직 결정하지 않은 사항과 사용자 확인이 필요한 내용을 기록한다. AI가 임의로 확정하지 않는다.
> 해결된 질문은 이 문서에서 제거하고, 닫는 commit·PR 본문에 `OQ-YYYYMMDD-NN → D-YYYYMMDD-NN`을 적는다.
>
> 문형: `- 질문: OQ-YYYYMMDD-NN <결정할 한 문장> | <관련 링크(선택)>`

## Git·CI

- 질문: OQ-20260903-01 GitHub Ruleset(`main` PR 필수·force push 금지·required check)을 지금 적용할지 | `docs/GIT-WORKFLOW.md` 8절
- 질문: OQ-20260903-02 API `contextLoads` test를 H2 등으로 자체 완결시켜 CI에 `./gradlew test`를 추가할지 | `docs/COMMANDS.md`
- 질문: OQ-20260903-03 Web lint 기존 오류(`scripts/` 미사용 변수·`any`)를 정리하고 CI에 lint를 추가할 시점

## 배포·제품

- 질문: OQ-20260903-04 Beta 배포 대상을 기존 EC2 Tomcat으로 유지할지 새 환경(jar + systemd·컨테이너)으로 갈지. 결정 후 `bootJar` 전환 | `work-status/ROADMAP.md`
- 질문: OQ-20260903-05 Bubot 로고 자산과 앱 표시명(현재 Mobile은 Botz 로고)

## 막지는 않음

- 질문: OQ-20260903-09 `apps/web/.env`의 `VITE_BOT_API_TOKEN`이 브라우저 번들에 노출되는 값인데 Beta에서 계속 프론트에 둘지, 서버 프록시(`/api/bot`)로만 쓰고 제거할지 | `apps/web/src/api/botApi.ts`

- 질문: OQ-20260903-08 `apps/api/src/main/resources/static/{web,index.html}`에 추적된 Desktop build 산출물을 Git에서 빼고 배포 시 생성할지, 아니면 계속 추적할지 (현재 bundle은 rename 전 `tpm_token`을 포함) | `work-status/work/refactor/wp-01-rename-tpm/PLAN.md`

- 질문: OQ-20260903-06 `MemberDTO.cash`(주식 예수금)·`members` 컬럼과 미사용 legacy DB 테이블을 언제 정리할지 (DB 변경 승인 필요)
- 질문: OQ-20260903-07 Private Worklog를 원본 저장소 worklog에 이어 쓸지 Bubot용으로 새로 만들지
