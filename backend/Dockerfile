# Render는 Java용 네이티브 런타임이 없다 (Node/Python/Ruby/Go/Rust만). Docker로 간다.
#
# 멀티스테이지 — 빌드 스테이지에만 JDK+Gradle을 두고, 최종 이미지는 JRE만 담아
# 이미지 크기를 줄인다. Render는 이 이미지를 그대로 실행하므로 CMD가 곧 시작 명령이다.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# 의존성 레이어를 소스보다 먼저 캐시한다 — 코드만 바뀌면 이 레이어는 재사용된다
COPY gradlew .
COPY gradle gradle
COPY build.gradle settings.gradle ./
RUN ./gradlew dependencies -q || true

COPY . .
RUN ./gradlew bootJar -x test -q

FROM eclipse-temurin:21-jre AS run
WORKDIR /app
COPY --from=build /app/build/libs/app.jar app.jar

# Render가 $PORT로 리스닝 포트를 알려준다. server.port는 application.yml에 없으므로
# 기본값(8080)을 따르는데, Render는 PORT 환경변수로 그 포트를 지정해 넘긴다
ENV JAVA_OPTS=""
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-8080}"]
