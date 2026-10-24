#!/usr/bin/env bash
# 개발 서버 둘 — 이미 떠 있으면 그대로 둔다 (여러 번 불러도 된다)
#   서버  :8080  server/.dev/db (처음이면 실데이터 픽스처 복사)  — STARLOG_PROFILE=dev
#   화면  :3000  next dev, /api는 Next 프록시로 8080에 (같은 출처)
# 로그: /tmp/starlog-dev-server.log · /tmp/starlog-dev-web.log
set -euo pipefail
cd "$(dirname "$0")/.."
up() { curl -s -o /dev/null --max-time 2 "$1"; }
if ! up http://127.0.0.1:8080/api/me; then
  echo "서버 띄우는 중 (:8080)"
  ( cd server && if [ -d .dev/db ]; then npm run dev; else npm run dev -- --fixture; fi ) > /tmp/starlog-dev-server.log 2>&1 &
  for i in $(seq 1 60); do up http://127.0.0.1:8080/api/me && break; sleep 0.5; done
fi
if ! up http://127.0.0.1:3000/dashboard; then
  echo "화면 띄우는 중 (:3000)"
  ( cd frontend && NEXT_PUBLIC_SAME_ORIGIN=1 npx next dev -p 3000 ) > /tmp/starlog-dev-web.log 2>&1 &
  for i in $(seq 1 120); do up http://127.0.0.1:3000/dashboard && break; sleep 1; done
fi
up http://127.0.0.1:8080/api/me && echo "서버 OK :8080" || { echo "서버 실패 — /tmp/starlog-dev-server.log"; exit 1; }
up http://127.0.0.1:3000/dashboard && echo "화면 OK :3000" || { echo "화면 실패 — /tmp/starlog-dev-web.log"; exit 1; }
