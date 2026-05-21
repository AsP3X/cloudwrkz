# Production image: build the Vite SPA and serve `dist/` with nginx (API proxied at /api).
# Build from repository root: `docker build -f apps/web-vite/Dockerfile .`
#
# For Vite dev server + bundled CLI in Docker, use `apps/web-vite/Dockerfile.dev` instead.

FROM node:25-bookworm AS builder

RUN npm install -g pnpm@9

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared shared
COPY apps/web-vite apps/web-vite

# Lockfile may not match pnpm overrides metadata inside the slim Docker context; install must succeed to run the build.
RUN pnpm install --no-frozen-lockfile

ARG VITE_API_URL=/api/v1
ARG VITE_APP_NAME=CloudWrkz
ARG VITE_SEARCH_API_URL=/next-api
ARG VITE_LOG_LEVEL=warn

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_SEARCH_API_URL=$VITE_SEARCH_API_URL
ENV VITE_LOG_LEVEL=$VITE_LOG_LEVEL

RUN pnpm --filter web-vite build

FROM nginx:1.27-alpine

COPY apps/web-vite/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /workspace/apps/web-vite/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
