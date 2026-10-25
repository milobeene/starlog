#!/usr/bin/env bash
# 데스크탑 빌드 (v2) — 프론트를 정적으로 뽑고, 서버를 번들 하나로 묶는다.
#
# 정적 파일은 desktop/web **한 곳**이다 — 입구·본 앱(app://)도, 서버의 http 사본도 이걸 쓴다.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "▶ 1/2  프론트 정적 빌드 → desktop/web"
cd "$ROOT/frontend"
STARLOG_DESKTOP=1 npx next build
WEB="$ROOT/desktop/web"
rm -rf "$WEB"; mkdir -p "$WEB"
cp -R "$ROOT/frontend/out/." "$WEB/"
echo "   $(find "$WEB" -type f | wc -l | tr -d ' ')개 파일 · $(du -sh "$WEB" | cut -f1)"

echo "▶ 2/2  서버 번들 → desktop/server/main.mjs"
cd "$ROOT/server"
npx tsx scripts/gen-migrations.ts
node scripts/bundle.mjs
ls -lh "$ROOT/desktop/server/main.mjs"

echo "✅ 완료 — desktop/ 에서 npm start"
