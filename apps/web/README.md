# Bubit Web

Spring Boot API(`apps/api`, 8081)를 두고 Desktop·Mobile(PWA) 두 진입점을 한 Vite 프로젝트로 개발하는 프론트엔드다. 구조와 의존 방향은 `docs/architecture/STRUCTURE.md`, 명령은 `docs/COMMANDS.md`.

## 개발 실행

```bash
cd apps/web
npm ci
npm run dev            # Mobile  → http://localhost:5173/mobile/ (ops/front-end.sh는 5175)
npm run dev:desktop    # Desktop → http://localhost:5174/web/
```

Vite 개발 서버는 API 요청을 `http://localhost:8081`의 Spring Boot 서버로 프록시한다.
