# Bubot 실행·검증 명령

## API (`apps/api`)

```bash
cd apps/api
./gradlew test             # test 프로필(H2 in-memory·더미 키) — DB·.env 없이 실행 가능, CI 포함
./gradlew compileJava
./gradlew bootWar -x test
./gradlew bootRun
```

자동매매·Paper·Backtest·Admin·Push API는 `trading` 프로필에서만 등록된다(`@Profile("trading")`). 기본(`dev`)이 Beta 모드다.
trading 모드 로컬 기동: `JAVA_TOOL_OPTIONS="-Dspring.profiles.active=dev,trading" ./ops/back-end.sh`
(`back-end.sh`가 `SPRING_PROFILES_ACTIVE=dev`를 고정하므로 env 대신 JVM 속성으로 덮어쓴다).

`./gradlew test`는 `src/test/resources/application-test.properties`(H2, 더미 키, 외부 WebSocket 차단)로 컨텍스트를 띄운다. 로컬 properties가 없어도 돈다. CI Gate는 `test`다.

## Web (`apps/web`)

```bash
cd apps/web
npm ci
npm test
npm run build        # Mobile → dist/
npm run build:web    # Desktop → dist-web/
npm run lint         # error 0 · warning 320 baseline(2026-09-03), CI 포함
```

## Worker·Shared 회귀 (루트)

```bash
node --experimental-strip-types ops/verify/verify-signals.ts
node --experimental-strip-types ops/verify/verify-worker-harmonic-status.ts
node --experimental-strip-types ops/verify/verify-worker-abcd-status.ts
node --experimental-strip-types ops/verify/verify-worker-smc-status.ts
node --experimental-strip-types ops/verify/verify-monitoring-registry.ts
node --experimental-strip-types ops/verify/verify-schema-bridge.ts
```

`verify-signals`·`verify-worker-harmonic-status`는 2026-09-02 기준 기존 baseline drift로 실패한다. baseline을 바꾸는 `--update`는 별도 승인 후 사용한다.

## 로컬 기동

`ops/back-end.sh`, `ops/front-end.sh`, `ops/worker.sh`. 워커는 실계좌 연결 프로세스라 사용자 승인 후에만 기동한다.
