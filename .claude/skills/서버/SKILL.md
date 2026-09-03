---
name: 서버
description: 로컬 개발 서버(백엔드 8081 / 프론트 모바일 5175 + 웹 5174 / 통합 워커)를 한 번에 재실행한다. 사용자가 "/서버" 또는 "서버 재실행/띄워줘"라고 할 때 사용.
---

# 서버 재실행 (백엔드 + 프론트 + 워커)

프로젝트 루트의 실행 스크립트 3개를 **각각 백그라운드로** 기동한다.

## 실행 순서 (의존성 때문에 순서 중요)

워커는 백엔드(8081)에 의존하므로 **백엔드 → 프론트 → 워커** 순서로 띄운다.

1. **이미 떠 있는 프로세스 정리** (포트 충돌 방지). 다음을 Bash로 실행:
   ```bash
   pkill -f "gradlew bootRun" 2>/dev/null; pkill -f "com.tj.app.TpmApplication" 2>/dev/null; pkill -f "GradleDaemon" 2>/dev/null; pkill -f "vite" 2>/dev/null; pkill -f "unified-worker" 2>/dev/null; sleep 3; lsof -nP -iTCP:8081 -sTCP:LISTEN 2>/dev/null && echo "⚠️ 8081 여전히 점유 중 — 위 PID 수동 kill 필요" || echo "기존 프로세스 정리 완료 (8081 비어있음)"
   ```
   ⚠️ `gradlew bootRun` 만 죽이면 **이미 실행 중인 자바 앱(TpmApplication)이 8081을 계속 점유**해서
   새 백엔드가 기동 실패(`webServerStartStop`)한다. 반드시 `TpmApplication` 까지 죽이고 8081이 비었는지 확인할 것.

2. **백엔드** — `run_in_background: true` 로 실행:
   ```bash
   ./ops/back-end.sh
   ```

3. **프론트(모바일 5175 + 웹 5174)** — `run_in_background: true` 로 실행:
   ```bash
   ./ops/front-end.sh
   ```
   front-end.sh 하나가 모바일·웹 두 Vite를 동시에 띄운다.

4. 백엔드가 8081에서 응답할 때까지 대기 (워커가 붙기 전에 떠 있어야 함). Bash로:
   ```bash
   for i in $(seq 1 30); do curl -sf http://localhost:8081/ >/dev/null 2>&1 && { echo "백엔드 OK"; break; }; sleep 2; done
   ```
   (404여도 포트가 살아있으면 OK로 간주 — `curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/` 가 000이 아니면 됨)

5. **워커** — `run_in_background: true` 로 실행:
   ```bash
   ./ops/worker.sh
   ```

## 마무리 보고

세 프로세스를 모두 띄운 뒤 사용자에게 알려줄 것:
- 백엔드: http://localhost:8081
- 프론트 모바일(접속): http://localhost:5175/mobile/  (admin / admin1234)
- 프론트 데스크톱 웹(접속): http://localhost:5174/web/
- 워커: 통합 워커 실행 중 (활성 매매설정 폴링)

  ※ front-end.sh 하나가 모바일(5175)+웹(5174)을 동시에 띄운다.

## 주의
- `worker.sh` / `back-end.sh` 는 비밀값을 담고 있어 gitignore 처리됨. 없으면 사용자에게 알릴 것.
- 워커는 **실거래 E2E 미검증** 상태 — 띄울 때 한 번 환기해줄 것.
- 로그를 확인하려면 BashOutput 으로 각 백그라운드 셸의 출력을 본다.
