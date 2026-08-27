#!/usr/bin/env bash
# 데스크탑(v1.0) 빌드 — 프론트를 정적으로 뽑아 백엔드 리소스에 넣고 실행 가능한 jar를 만든다.
#
# 순서가 중요하다. 프론트를 **먼저** 복사해야 bootJar가 그걸 같이 싼다.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "▶ 1/3  프론트 정적 빌드"
cd "$ROOT/frontend"
STARLOG_DESKTOP=1 npx next build

echo "▶ 2/3  백엔드 리소스로 복사"
STATIC="$ROOT/backend/src/main/resources/static"
rm -rf "$STATIC"; mkdir -p "$STATIC"
cp -R "$ROOT/frontend/out/." "$STATIC/"
echo "   $(find "$STATIC" -type f | wc -l | tr -d ' ')개 파일 · $(du -sh "$STATIC" | cut -f1)"

echo "▶ 3/3  백엔드 jar"
cd "$ROOT/backend"
./gradlew bootJar -q
ls -lh build/libs/*.jar

echo "✅ 완료 — desktop/ 에서 npm start"
