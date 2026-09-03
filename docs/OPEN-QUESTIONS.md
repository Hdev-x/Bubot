# Bubot 미확정 질문

- GitHub Ruleset(`main` PR 필수·force push 금지·required check)을 지금 적용할지.
- Beta 배포 대상: 기존 EC2 Tomcat 유지 vs 새 환경(jar + systemd, 컨테이너 등). 결정 후 `bootJar` 전환.
- API `contextLoads` test를 H2 등으로 자체 완결시켜 CI에 `./gradlew test`를 추가할지.
- Web lint 기존 오류(`scripts/`의 미사용 변수·`any`) 정리 후 CI에 lint를 추가할 시점.
- Bubot 로고 자산과 앱 표시명(현재 Mobile은 Botz 로고).
- `MemberDTO.cash`(주식 예수금)와 `members` 컬럼, 미사용 legacy DB 테이블 정리 시점 (DB 변경 승인 필요).
