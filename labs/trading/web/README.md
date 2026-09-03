# labs/trading/web

`apps/web`에서 Beta 범위 밖으로 분리한 자동매매·Paper·Backtest·Admin·Push UI 보존본이다 (wp-02 d02, 2026-09-03).
Vite 진입점이 없고 실행되지 않는다. 의존 방향은 `labs → apps/web`(`@web/*`)·`shared`이며, `apps/web`은 이 폴더를 import하지 않는다.

타입체크(로컬): `apps/web`의 의존성을 빌려 쓴다.

```bash
ln -sfn ../../../apps/web/node_modules labs/trading/web/node_modules
cd labs/trading/web && npx tsc -p tsconfig.json --noEmit
```
