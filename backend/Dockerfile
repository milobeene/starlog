# Render는 Java용 네이티브 런타임이 없다 (Node/Python/Ruby/Go/Rust만). Docker로 간다.
#
# 멀티스테이지 — 빌드 스테이지에만 JDK+Gradle을 두고, 최종 이미지는 JRE만 담아
# 이미지 크기를 줄인다. Render는 이 이미지를 그대로 실행하므로 ENTRYPOINT가 곧 시작 명령이다.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# 래퍼와 빌드 스크립트를 먼저 — 의존성 레이어가 소스보다 앞서야 코드만 바뀔 때 캐시가 산다
COPY gradlew ./
COPY gradle gradle
COPY build.gradle settings.gradle ./
RUN chmod +x gradlew && ./gradlew dependencies -q || true

# **소스를 명시적으로 복사한다.** `COPY . .`로 두면 빌드 컨텍스트가 잘못 잡혀 src가 안 와도
# 조용히 넘어가고, 한참 뒤 bootJar에서 "Main class를 못 찾겠다"는 엉뚱한 메시지로 터진다.
# 경로를 박아두면 컨텍스트가 틀린 순간 이 줄에서 바로 죽는다
COPY src src

RUN ./gradlew bootJar -x test -q

# 산출물이 실제로 나왔는지 확인 — 없으면 여기서 끊어야 런타임까지 안 흘러간다
RUN test -f build/libs/app.jar || (echo "app.jar가 없다. bootJar 산출물 이름을 확인할 것" && ls -la build/libs && exit 1)

FROM eclipse-temurin:21-jre AS run
WORKDIR /app
COPY --from=build /app/build/libs/app.jar app.jar

# Render가 $PORT로 리스닝 포트를 알려준다. 로컬에서 그냥 돌릴 때를 위해 8080을 기본값으로 둔다
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-8080}"]
