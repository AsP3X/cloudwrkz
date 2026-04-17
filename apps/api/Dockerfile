# Build context must be the monorepo root (directory that contains `apps/api/`), e.g.:
#   docker build -f apps/api/Dockerfile .
# Compose uses the same layout via `context: ${CLOUDWRKZ_REPO_ROOT:-.}`.

FROM rust:1.88-slim-bookworm AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Dependency layer: workspace manifests + stub sources so `cargo build` resolves crates once.
COPY Cargo.toml Cargo.lock ./
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/cli/Cargo.toml apps/cli/Cargo.toml
RUN mkdir -p apps/api/src apps/cli/src \
    && printf '%s\n' 'fn main() {}' > apps/api/src/main.rs \
    && printf '%s\n' 'fn main() {}' > apps/cli/src/main.rs \
    && cargo build --release

COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY apps/cli/src apps/cli/src
RUN touch apps/api/src/main.rs apps/cli/src/main.rs \
    && cargo build --release -p cloudwrkz-api -p cloudwrkz-cli

FROM debian:bookworm-slim

# curl: used by docker-compose healthcheck (GET /api/health).
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/target/release/cloudwrkz-api .
COPY --from=builder /build/target/release/cloudwrkz-cli /usr/local/bin/cloudwrkz-cli
COPY --from=builder /build/apps/api/migrations migrations/

EXPOSE 8080
CMD ["./cloudwrkz-api"]
