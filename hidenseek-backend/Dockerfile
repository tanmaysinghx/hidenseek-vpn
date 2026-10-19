# Build from the repository root (the jar bundles hidenseek-agent/scripts/install.sh):
#   docker build -f hidenseek-backend/Dockerfile -t hidenseek-backend .
#   docker build -f hidenseek-backend/Dockerfile --target test .   # runs the test suite
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY hidenseek-agent/scripts/install.sh hidenseek-agent/scripts/install.sh
COPY hidenseek-backend/gradlew hidenseek-backend/settings.gradle hidenseek-backend/build.gradle hidenseek-backend/
COPY hidenseek-backend/gradle hidenseek-backend/gradle
RUN cd hidenseek-backend && ./gradlew --no-daemon -q dependencies > /dev/null
COPY hidenseek-backend/src hidenseek-backend/src
RUN cd hidenseek-backend && ./gradlew --no-daemon -q bootJar -x test

# Optional gate, built only on request: docker build --target test ...
FROM build AS test
RUN cd hidenseek-backend && ./gradlew --no-daemon test

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 hidenseek
WORKDIR /app
COPY --from=build /src/hidenseek-backend/build/libs/*.jar app.jar
USER hidenseek
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8090 && printf 'GET /actuator/health HTTP/1.0\r\n\r\n' >&3 && grep -q UP <&3"]
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
