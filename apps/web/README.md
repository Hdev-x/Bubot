# Bullum Web

Spring Boot 백엔드는 유지하고, 모바일/앱 전용 화면을 React로 분리해서 개발하기 위한 프론트엔드입니다.

## 개발 실행

```bash
cd frontend
npm install
npm run dev
```

Vite 개발 서버는 `/stock`, `/coin`, `/api`, `/asset` 요청을 `http://localhost:80`의 Spring Boot 서버로 프록시합니다.
