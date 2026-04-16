# Dev image: Node (Vite) + bundled `cloudwrkz-cli` (same container as the web dev server).
# Build from repository root: `docker build -f apps/web-vite/Dockerfile .`
#
# Compose mounts the repo at /workspace and runs `pnpm --filter web-vite dev`. Run the CLI with:
#   docker compose exec web-vite cloudwrkz-cli --help
# Use DATABASE_URL=postgresql://cloudwrkz:...@postgres:5432/cloudwrkz (service hostname `postgres`).

FROM rust:1.88-slim-bookworm AS rust-builder

WORKDIR /build
RUN apt-get update && apt-get install -y pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY apps/cli apps/cli
COPY apps/api apps/api

RUN cargo build -p cloudwrkz-cli --release

FROM node:25-bookworm

RUN apt-get update && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /build/target/release/cloudwrkz-cli /usr/local/bin/cloudwrkz-cli

WORKDIR /workspace

EXPOSE 5173

# Compose overrides with the same command; keeps `docker run` usable without a compose file.
CMD ["sh", "-c", "corepack enable && corepack prepare pnpm@9 --activate && cd /workspace && pnpm install && pnpm --filter web-vite dev"]
