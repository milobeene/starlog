#!/usr/bin/env bash
# 번들 JRE를 만든다 (v1.0 10단계) — 사용자 PC에 자바가 없어도 앱이 돈다.
#
# ## 왜 통짜 JDK가 아니라 jlink인가
#
# JDK 21 전체는 300MB가 넘는다. `jlink`는 **쓰는 모듈만 골라** 런타임을 새로 조립한다.
# 우리 앱은 54MB로 떨어진다.
#
# ## ⚠️ 모듈 목록은 추측이 아니라 실측이다
#
# 아래 목록은 실제로 jar를 띄워 보며 만들었다. 빠뜨리면 **컴파일은 되는데 런타임에**
# `NoClassDefFoundError`로 죽는다 — 실제로 `java.compiler`가 그렇게 걸렸다
# (Hibernate가 `javax.lang.model`을 본다).
#
# 특히 눈에 안 띄는 것들:
#   java.desktop        스프링이 `java.beans.Introspector`를 쓴다. 이미지와 무관하다
#   java.security.sasl  **Neon(PostgreSQL) 로그인이 SCRAM-SHA-256이다**
#   jdk.crypto.ec       TLS 키 교환. 빠지면 IGDB·구글 호출이 통째로 죽는다
#   jdk.unsupported     Netty 등이 `sun.misc.Unsafe`를 본다
#   jdk.localedata      **한국어 로케일.** 빠지면 날짜·정렬이 영어 기준으로 돈다
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
OUT="$ROOT/desktop/runtime"

# ──────────────────────────────────────────────────────────────────────────
# 어떤 JDK로 만드는가 — **Temurin으로 고정한다** (2026-08-28 결정)
#
# 로컬 맥에 깔려 있던 건 오라클 JDK였다. 오라클 NFTC도 무료 재배포를 허용하지만
# 버전이 늙으면 OTN으로 넘어가고, 무엇보다 **GitHub Actions의 setup-java 기본값이
# Temurin이라** 그냥 두면 맥 dmg와 윈도우 exe에 서로 다른 JVM이 들어간다.
# Temurin은 GPLv2+CE라 재배포가 명확하다.
#
# 찾는 순서:
#   1. $STARLOG_JDK          — 직접 지정할 때
#   2. $JAVA_HOME            — CI(setup-java)가 여기에 Temurin을 꽂아준다
#   3. 캐시                   — 전에 받아둔 것
#   4. Adoptium에서 받는다     — 로컬 첫 실행
# ──────────────────────────────────────────────────────────────────────────
CACHE="${STARLOG_JDK_CACHE:-$HOME/.cache/starlog/jdk}"

case "$(uname -s)" in
  Darwin) OS=mac;   HOME_SUFFIX="/Contents/Home" ;;
  Linux)  OS=linux; HOME_SUFFIX="" ;;
  *)      OS=other; HOME_SUFFIX="" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=aarch64 ;;
  *)             ARCH=x64 ;;
esac

download_temurin() {
  if [ "$OS" = "other" ]; then
    echo "❌ 이 OS에서는 자동 내려받기를 안 한다 (윈도우 등)."
    echo "   JAVA_HOME을 Temurin 21 JDK로 맞춰라 — CI는 setup-java가 해준다"
    exit 1
  fi
  local url="https://api.adoptium.net/v3/binary/latest/21/ga/$OS/$ARCH/jdk/hotspot/normal/eclipse"
  echo "▶ Temurin 21을 받는다 ($OS/$ARCH) — 처음 한 번만"
  mkdir -p "$CACHE"
  # -L: 리다이렉트를 따라간다. Adoptium API는 실제 파일로 302를 준다
  curl -fL --progress-bar "$url" -o "$CACHE/temurin.tar.gz"
  tar -xzf "$CACHE/temurin.tar.gz" -C "$CACHE"
  rm -f "$CACHE/temurin.tar.gz"
}

find_cached() {
  # jdk-21.0.x+y 같은 폴더 하나. 여러 개면 가장 최근 것.
  # ⚠️ `ls | sort | tail`을 그냥 쓰면 안 된다 — 캐시가 비었을 때 `ls`가 실패하고
  # `set -o pipefail`이 그걸 파이프 전체의 실패로 올려서 **스크립트가 조용히 끝난다**
  local dirs
  dirs=$(ls -d "$CACHE"/jdk-21* 2>/dev/null) || return 0
  printf '%s\n' "$dirs" | sort | tail -1
}

if [ -n "${STARLOG_JDK:-}" ]; then
  JH="$STARLOG_JDK"
elif [ -n "${JAVA_HOME:-}" ] && [ -d "$JAVA_HOME/jmods" ]; then
  JH="$JAVA_HOME"
else
  found=$(find_cached)
  if [ -z "$found" ] || [ ! -d "$found$HOME_SUFFIX/jmods" ]; then
    download_temurin
    found=$(find_cached)
  fi
  JH="$found$HOME_SUFFIX"
fi

if [ ! -d "$JH/jmods" ]; then
  echo "❌ jmods가 없다: $JH/jmods"
  echo "   JRE가 아니라 **JDK**가 필요하다"
  exit 1
fi

# ⚠️ 만든 사람을 찍어둔다. 오라클로 만들어 놓고 모르고 배포하는 걸 막는다
IMPLEMENTOR=$(grep '^IMPLEMENTOR=' "$JH/release" 2>/dev/null | cut -d'"' -f2)
if [ "$IMPLEMENTOR" != "Eclipse Adoptium" ]; then
  echo "⚠️  Temurin이 아니다 — IMPLEMENTOR=${IMPLEMENTOR:-알수없음}"
  echo "   공개 릴리스에는 Temurin을 쓴다. JAVA_HOME을 지우고 다시 돌리면 받아온다"
fi

MODULES="java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,\
java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,\
java.sql,java.sql.rowset,java.transaction.xa,java.xml,java.xml.crypto,jdk.charsets,\
jdk.crypto.cryptoki,jdk.crypto.ec,jdk.localedata,jdk.management,jdk.net,jdk.unsupported,jdk.zipfs"

echo "▶ JDK: $JH"
echo "   만든 곳: ${IMPLEMENTOR:-알수없음}"
"$JH/bin/java" -version 2>&1 | head -1

rm -rf "$OUT"
"$JH/bin/jlink" \
  --module-path "$JH/jmods" \
  --add-modules "$MODULES" \
  --strip-debug --no-header-files --no-man-pages \
  --compress=zip-6 \
  --include-locales=en,ko \
  --output "$OUT"

echo "▶ 확인"
"$OUT/bin/java" -version 2>&1 | head -1
echo "✅ $OUT · $(du -sh "$OUT" | cut -f1)"
