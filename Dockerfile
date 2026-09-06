# Bantu Collaborative IDE — Multi-stage Dockerfile for Render

FROM ubuntu:22.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential g++ gcc make binutils file \
    libsqlite3-dev libcurl4-openssl-dev libffi-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY bantu-src/compiler/ /build/compiler/
RUN cd /build/compiler && chmod +x build.sh && ./build.sh \
    && test -f /build/compiler/build/bantu \
    && cp /build/compiler/build/bantu /build/bantu && chmod +x /build/bantu

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV PORT=10000
ENV HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 ca-certificates libcurl4 libffi8 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy the Bantu binary
COPY --from=builder /build/bantu /usr/local/bin/bantu
RUN chmod +x /usr/local/bin/bantu

# Copy the app — force cache invalidation with ARG
ARG CACHE_BUST=1
COPY server.b /app/server.b
COPY public/ /app/public/

# Verify Bantu works
RUN /usr/local/bin/bantu --version

EXPOSE 10000
CMD ["bantu", "run", "server.b"]
