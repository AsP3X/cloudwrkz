# Build context must be the monorepo root (directory that contains `apps/api/`), e.g.:
#   docker build -f apps/api/Dockerfile .
# Compose uses the same layout via `context: ${CLOUDWRKZ_REPO_ROOT:-.}`.

FROM rust:1.88-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY apps/api/Cargo.toml apps/api/Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY apps/api/src/ src/
COPY apps/api/migrations/ migrations/
RUN touch src/main.rs && cargo build --release

FROM debian:bookworm-slim

# curl: used by docker-compose healthcheck (GET /api/health).
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/cloudwrkz-api .
COPY --from=builder /app/migrations migrations/

EXPOSE 8080
CMD ["./cloudwrkz-api"]
