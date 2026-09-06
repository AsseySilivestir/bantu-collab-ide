# ════════════════════════════════════════════════════════════════════
#  Bantu Collaborative IDE — Multi-stage Dockerfile for Render
#  ════════════════════════════════════════════════════════════════════
#
#  Stage 1: build the Bantu interpreter v1.3.2 from source
#  Stage 2: runtime — Bantu binary + the IDE app (server.b + public/)
# ════════════════════════════════════════════════════════════════════

# ─── Stage 1: Builder ──────────────────────────────────────────────
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential g++ gcc make binutils file \
        libsqlite3-dev libcurl4-openssl-dev libffi-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy the Bantu interpreter source (vendored from AsseySilivestir/Bantu)
COPY bantu-src/compiler/ /build/compiler/

RUN cd /build/compiler \
    && chmod +x build.sh \
    && ./build.sh \
    && test -f /build/compiler/build/bantu \
    && cp /build/compiler/build/bantu /build/bantu \
    && chmod +x /build/bantu

# ─── Stage 2: Runtime ──────────────────────────────────────────────
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libsqlite3-0 ca-certificates libcurl4 libffi8 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the Bantu binary
COPY --from=builder /build/bantu /usr/local/bin/bantu
RUN chmod +x /usr/local/bin/bantu

# Copy the IDE app
COPY server.b /app/server.b
COPY public/  /app/public/

# Verify Bantu works
RUN /usr/local/bin/bantu --version

# Render injects $PORT. Bantu listens on it.
EXPOSE 8080

CMD ["bantu", "run", "server.b"]
