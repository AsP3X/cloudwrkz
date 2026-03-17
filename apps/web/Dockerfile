# Multi-stage Dockerfile for cloudwrkz Next.js app

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:25-alpine AS builder

WORKDIR /app

# Install pnpm (pinned version for reproducible builds; npm used because Alpine image has no corepack)
RUN npm install -g pnpm@10.28.1

# Install dependencies (package.json + lockfile first for better layer caching)
COPY package.json pnpm-lock.yaml .npmrc* ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the app source
COPY . .

# Generate Prisma client (ARG so the dummy URL doesn't persist in the final image)
ARG DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"
RUN pnpm prisma generate

# Build the Next.js app (standalone output mode)
ENV NODE_ENV=production
RUN pnpm build

# Remove devDependencies so only production deps remain
RUN pnpm prune --prod

# ── Production runtime stage ────────────────────────────────────────────────
FROM node:25-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone Next.js server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets and public files (not included in standalone output)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy production node_modules for CLI and scripts (superset of standalone deps)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy CLI source, scripts, Prisma schema, and TypeScript config for runtime use
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

# Switch to non-root user
USER nextjs

# Expose the Next.js default port
EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Default command runs the web app via standalone server
# Override with e.g. `npx tsx src/cli/index.ts` to run the CLI
CMD ["node", "server.js"]
