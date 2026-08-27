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

# 같은 정적 파일이 두 곳에 필요하다.
#   backend/.../static/  → 본 앱. 스프링이 서빙한다 (오리진 하나)
#   desktop/web/         → **입구 화면.** 스프링이 뜨기 전에 app:// 로 로드한다
# 입구가 백엔드보다 먼저 떠야 한다는 게 v1.0 구조의 핵심이라(§2), 이 중복은 그 대가다
echo "▶ 2/3  정적 파일 복사 (본 앱 + 입구)"
STATIC="$ROOT/backend/src/main/resources/static"
WEB="$ROOT/desktop/web"
for target in "$STATIC" "$WEB"; do
  rm -rf "$target"; mkdir -p "$target"
  cp -R "$ROOT/frontend/out/." "$target/"
done
echo "   $(find "$STATIC" -type f | wc -l | tr -d ' ')개 파일 · $(du -sh "$STATIC" | cut -f1) × 2"

echo "▶ 3/3  백엔드 jar"
cd "$ROOT/backend"
./gradlew bootJar -q
ls -lh build/libs/*.jar

echo "✅ 완료 — desktop/ 에서 npm start"
