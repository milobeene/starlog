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

# jmods가 있어야 한다 — JRE만 깔려 있으면 못 만든다
if [ -n "${JAVA_HOME:-}" ]; then
  JH="$JAVA_HOME"
elif [ -x /usr/libexec/java_home ]; then
  JH=$(/usr/libexec/java_home -v 21)
else
  JH=$(dirname "$(dirname "$(command -v javac)")")
fi

if [ ! -d "$JH/jmods" ]; then
  echo "❌ jmods가 없다: $JH/jmods"
  echo "   JRE가 아니라 **JDK**가 필요하다. JAVA_HOME을 JDK 21로 맞춰라"
  exit 1
fi

MODULES="java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,\
java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,\
java.sql,java.sql.rowset,java.transaction.xa,java.xml,java.xml.crypto,jdk.charsets,\
jdk.crypto.cryptoki,jdk.crypto.ec,jdk.localedata,jdk.management,jdk.net,jdk.unsupported,jdk.zipfs"

echo "▶ JDK: $JH"
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
