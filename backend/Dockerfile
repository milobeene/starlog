# Render는 Java용 네이티브 런타임이 없다 (Node/Python/Ruby/Go/Rust만). Docker로 간다.
#
# 멀티스테이지 — 빌드 스테이지에만 JDK+Gradle을 두고, 최종 이미지는 JRE만 담아
# 이미지 크기를 줄인다. Render는 이 이미지를 그대로 실행하므로 ENTRYPOINT가 곧 시작 명령이다.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# ⚠️ **소스를 Gradle보다 먼저 놓는다. 순서를 바꾸지 말 것.**
#
# 예전에는 의존성 레이어를 캐시하려고 `COPY src` 앞에서 `./gradlew dependencies`를 한 번 돌렸다.
# 그러면 Render에서만 `compileJava NO-SOURCE`로 죽었다 — 자바 파일 219개가 멀쩡히 있는데도.
# 원인은 Gradle 9의 파일시스템 감시(VFS)다. 소스가 없는 상태로 Gradle을 돌리면
# "src/main은 존재하지 않는다"가 /app/.gradle/에 스냅샷으로 남고, 다음 실행이 그걸 복원해
# 소스를 통째로 못 본다. inotify 지원이 환경마다 달라 로컬(arm64·amd64 모두)은 통과하고
# Render만 걸렸다 — 그래서 재현에 오래 걸렸다.
#
# 캐시 이득을 포기한 대신 Gradle을 **소스가 다 놓인 뒤 한 번만** 돌린다. 배포마다 의존성을
# 다시 받아 30초쯤 손해지만, 환경에 따라 갈리는 실패보다 낫다.
COPY gradlew ./
COPY gradle gradle
COPY build.gradle settings.gradle ./
COPY src src

# --no-daemon: 컨테이너는 한 번 쓰고 버리므로 데몬이 이득이 없다.
# vfs.watch=false: 위 문제의 근본 스위치를 아예 꺼서 재발을 막는다
RUN chmod +x gradlew \
 && ./gradlew bootJar -x test --no-daemon -Dorg.gradle.vfs.watch=false

# 산출물이 실제로 나왔는지 확인 — 없으면 여기서 끊어야 런타임까지 안 흘러간다
RUN test -f build/libs/app.jar || (echo "app.jar가 없다. bootJar 산출물 이름을 확인할 것" && ls -la build/libs && exit 1)

FROM eclipse-temurin:21-jre AS run
WORKDIR /app
COPY --from=build /app/build/libs/app.jar app.jar

# Render가 $PORT로 리스닝 포트를 알려준다. 로컬에서 그냥 돌릴 때를 위해 8080을 기본값으로 둔다
# 타임존을 한국으로 박는다. 기본(UTC)이면 일일 쿼터가 한국 시간 오전 9시에 초기화되고,
# 정리 배치의 "새벽 3시"도 오후로 밀린다 — 화면 문구와 실제가 어긋난다
ENV TZ=Asia/Seoul

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -jar app.jar --server.port=${PORT:-8080}"]
