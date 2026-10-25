#!/usr/bin/env bash
# 개발 서버 둘 — 이미 떠 있으면 그대로 둔다 (여러 번 불러도 된다)
#   서버  :8080  server/.dev/db (처음이면 실데이터 픽스처 복사)  — STARLOG_PROFILE=dev
#   화면  :3000  next dev, /api는 Next 프록시로 8080에 (같은 출처). 127.0.0.1에만 연다 — 같은 망의 남이 붙지 않게
# 로그: /tmp/starlog-dev-server.log · /tmp/starlog-dev-web.log
set -euo pipefail
cd "$(dirname "$0")/.."
up() { curl -s -o /dev/null --max-time 2 "$1"; }
# 8080에 뭔가 떠 있다고 우리 서버인 건 아니다 — /api/me가 프로필(nickname)로 답해야 STARLOG다
starlog() { curl -s --max-time 2 http://127.0.0.1:8080/api/me | grep -q '"nickname"'; }
if up http://127.0.0.1:8080/api/me && ! starlog; then
  echo "8080에 STARLOG가 아닌 것이 떠 있습니다 — 끄고 다시 실행해 주세요"; exit 1
fi
if ! starlog; then
  echo "서버 띄우는 중 (:8080)"
  ( cd server && if [ -d .dev/db ]; then npm run dev; else npm run dev -- --fixture; fi ) > /tmp/starlog-dev-server.log 2>&1 &
  for i in $(seq 1 60); do starlog && break; sleep 0.5; done
fi
if ! up http://127.0.0.1:3000/dashboard; then
  echo "화면 띄우는 중 (:3000)"
  ( cd frontend && NEXT_PUBLIC_SAME_ORIGIN=1 npx next dev -H 127.0.0.1 -p 3000 ) > /tmp/starlog-dev-web.log 2>&1 &
  for i in $(seq 1 120); do up http://127.0.0.1:3000/dashboard && break; sleep 1; done
fi
starlog && echo "서버 OK :8080" || { echo "서버 실패 — /tmp/starlog-dev-server.log"; exit 1; }
up http://127.0.0.1:3000/dashboard && echo "화면 OK :3000" || { echo "화면 실패 — /tmp/starlog-dev-web.log"; exit 1; }
