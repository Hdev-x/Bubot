#!/usr/bin/env bash
# 프론트엔드(Vite dev) 실행 스크립트 — Mobile + Desktop 동시 기동
#   Mobile : http://localhost:5175/mobile/  (vite.config.js,         포트 5175)
#   Desktop: http://localhost:5174/web/     (vite.config.desktop.js, 포트 5174)
# 둘 다 백그라운드로 띄우고 wait. Ctrl+C(또는 종료) 시 trap이 두 vite를 모두 정리한다.
set -euo pipefail

cd "$(dirname "$0")/../apps/web"

# npm 래퍼를 거치면 정리 시 vite 자식이 고아로 남으므로 vite 바이너리를 직접 호출한다.
# (그래야 추적 PID = vite 프로세스 자신 → 종료 시 kill이 확실히 먹힘. macOS엔 setsid 없음)
# 플래그는 package.json의 dev / dev:desktop 스크립트와 동일하게 맞춤.
VITE="./node_modules/.bin/vite"

# ── Desktop(5174) 기동 ────────────────────────────────────────
echo "[front-end] Desktop dev 기동 → http://localhost:5174/web/"
"$VITE" --config vite.config.desktop.js --configLoader runner --host 0.0.0.0 --port 5174 --strictPort &
DESKTOP_PID=$!

# ── Mobile(5175) 기동 ─────────────────────────────────────────
echo "[front-end] Mobile Vite dev 기동 → http://localhost:5175/mobile/"
"$VITE" --force --configLoader runner --host 0.0.0.0 --port 5175 --strictPort &
MOBILE_PID=$!

# 어떤 종료 경로(Ctrl+C/kill/EXIT)든 두 vite를 직접 정리
cleanup() {
  echo ""
  echo "[front-end] 종료 — Desktop(PID $DESKTOP_PID) · Mobile(PID $MOBILE_PID) 정리"
  kill "$DESKTOP_PID" "$MOBILE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 두 dev 서버가 떠 있는 동안 대기 (둘 중 하나라도 죽으면 wait가 깨어남)
wait
