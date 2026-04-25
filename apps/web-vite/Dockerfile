# Dev image: Node (Vite) + bundled `cloudwrkz-cli` (same container as the web dev server).
# Build from repository root: `docker build -f apps/web-vite/Dockerfile .`
#
# `pnpm install --frozen-lockfile` runs at image build time. Compose should not bind-mount `.` over
# `/workspace` or it will replace `node_modules` from the image. Rebuild after lockfile or dependency changes.
# Run the CLI with: `docker compose exec web-vite cloudwrkz-cli --help`
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

# pnpm via npm (not corepack): corepack is missing from PATH in some Node images / shells.
RUN apt-get update && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@9

COPY --from=rust-builder /build/target/release/cloudwrkz-cli /usr/local/bin/cloudwrkz-cli

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-vite apps/web-vite

RUN pnpm install --frozen-lockfile

EXPOSE 5173

CMD ["pnpm", "--filter", "web-vite", "dev"]
