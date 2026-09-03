# Bubot 실행·검증 명령

## API (`apps/api`)

```bash
cd apps/api
./gradlew compileJava
./gradlew bootWar -x test
./gradlew bootRun
```

`./gradlew test`의 `contextLoads`는 로컬 DB·env(`APP_JWT_SECRET` 등)에 의존해 현재 환경에서 실패한다. CI Gate는 `compileJava`다.

## Web (`apps/web`)

```bash
cd apps/web
npm ci
npm test
npm run build        # Mobile → dist/
npm run build:web    # Desktop → dist-web/
npm run lint         # 기존 오류 있음, CI 미포함
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
