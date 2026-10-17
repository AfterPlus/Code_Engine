# Java backend image. Build context is the repository root (the jar bundles ../frontend):
#   docker compose -f deploy/backend/compose.yaml build
# Multi-arch base images, so this builds natively on an Oracle Ampere (arm64) VM as well as on x86.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
COPY frontend frontend
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f backend/pom.xml package -DskipTests

# A full JDK, not a JRE: the server compiles user code with javac and drives the child JVMs through JDI.
FROM eclipse-temurin:21-jdk
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \
 && mkdir -p /run/codeengine \
 && chown app:app /run/codeengine
COPY --from=build /src/backend/target/code-engine-0.1.0.jar /app/code-engine.jar
USER app
WORKDIR /app
# Serve on a Unix socket: the container runs with no network (see compose.yaml).
ENV LCV_SERVER_UNIX_SOCKET=/run/codeengine/api.sock
ENTRYPOINT ["java", "-Xmx512m", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/code-engine.jar"]
