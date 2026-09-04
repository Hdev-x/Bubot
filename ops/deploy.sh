#!/usr/bin/env bash
# AutoTrade 배포 스크립트
# 모바일 빌드 → static/mobile + 웹콘솔 빌드 → static/web → bootWar → EC2 Tomcat WAR 업로드 → 검증
# (/mobile/·/web/ 둘 다 FileMappingConfig forward + SecurityConfig permit)
# 사용법: ./deploy.sh
set -euo pipefail

# ── 설정 ────────────────────────────────────────────────
SSH_KEY="$HOME/.ssh/hdev.pem"
EC2_USER="ubuntu"
EC2_HOST="52.79.205.49"
WEBAPPS="/var/lib/tomcat10/webapps"
SITE_URL="https://autotradev.duckdns.org/mobile/"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"
SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=10"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

# ── 1. 프론트엔드 빌드 ──────────────────────────────────
say "1/5 프론트엔드 빌드"
( cd apps/web && npm run build )

# ── 2. dist → Spring static/mobile (옛 빌드 정리 후 복사) ─
say "2/6 dist → apps/api/src/main/resources/static/mobile 복사"
rm -rf apps/api/src/main/resources/static/mobile
cp -r apps/web/dist apps/api/src/main/resources/static/mobile
LOCAL_BUNDLE=$(grep -oE 'index-[A-Za-z0-9_-]+\.js' apps/web/dist/index.html | head -1)
echo "   새 번들: $LOCAL_BUNDLE"

# ── 2b. Desktop 빌드 → Spring static/web (desktop.html → index.html) ─
#   /web/ 은 FileMappingConfig 가 forward:/web/index.html 로 서빙하므로 진입점을 index.html로 맞춘다.
say "3/6 Desktop 빌드 → apps/api/src/main/resources/static/web"
( cd apps/web && npm run build:desktop )
rm -rf apps/api/src/main/resources/static/web
cp -r apps/web/dist-desktop apps/api/src/main/resources/static/web
mv apps/api/src/main/resources/static/web/desktop.html apps/api/src/main/resources/static/web/index.html
echo "   Desktop → static/web/index.html"

# ── 3. WAR 빌드 ─────────────────────────────────────────
say "4/6 bootWar 빌드"
( cd apps/api && ./gradlew bootWar -x test -q )
WAR="apps/api/build/libs/bullum-0.0.1-SNAPSHOT.war"
[ -f "$WAR" ] || { echo "WAR 없음: $WAR"; exit 1; }
echo "   $WAR ($(du -h "$WAR" | cut -f1))"

# ── 4. 업로드 → Tomcat 정지 후 ROOT.war 교체 → 재기동 ─
#   EC2 RAM이 2GB로 작아 hot-deploy(구·신 앱 동시 적재) 시 OOM 발생.
#   stop → 교체 → start 로 단일 인스턴스만 로드해 메모리 두 배 적재를 막는다.
#   (autoDeploy=false 라 stop 상태에서 교체해도 멋대로 재배포되지 않음)
say "5/6 EC2 업로드 → Tomcat 정지·교체·재기동"
scp -i "$SSH_KEY" -o BatchMode=yes "$WAR" "$EC2_USER@$EC2_HOST:/tmp/ROOT_new.war"
$SSH "$EC2_USER@$EC2_HOST" "
  sudo systemctl stop tomcat10
  sudo rm -rf '$WEBAPPS'/ROOT '$WEBAPPS'/ROOT.war '$WEBAPPS'/ROOT##v*
  sudo cp /tmp/ROOT_new.war '$WEBAPPS/ROOT.war'
  sudo chown root:root '$WEBAPPS/ROOT.war'
  rm -f /tmp/ROOT_new.war
  sudo systemctl start tomcat10
"
echo "   Tomcat 재기동 + ROOT.war 단일 배치 완료"

# ── 5. 반영 검증 (서버 번들이 로컬과 일치할 때까지 대기) ─
say "6/6 배포 검증 (최대 3분)"
for i in $(seq 1 36); do
  SERVED=$(curl -s -m 10 "$SITE_URL" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)
  if [ "$SERVED" = "$LOCAL_BUNDLE" ]; then
    printf '\n\033[1;32m✓ 배포 완료: 서버가 %s 서빙 (%d초)\033[0m\n' "$SERVED" "$((i*5))"
    echo "  $SITE_URL"
    exit 0
  fi
  sleep 5
done
echo "⚠ 3분 내 미반영. 서버 현재 번들: ${SERVED:-(응답없음)} / 기대: $LOCAL_BUNDLE"
echo "  Tomcat 로그 확인: $SSH $EC2_USER@$EC2_HOST 'sudo tail -50 /var/log/tomcat10/catalina.out'"
exit 1
