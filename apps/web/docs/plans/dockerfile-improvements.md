# Dockerfile Improvements Plan

## 1. Fix Node version mismatch
- **Impact:** Correctness
- Change `node:22-alpine` to `node:25-alpine` in both builder and runner stages
- `package.json` requires `node >= 25.2.0` but the Dockerfile currently uses Node 22

## 2. Enable Next.js standalone output
- **Impact:** Image size (huge reduction)
- Add `output: 'standalone'` to `next.config.js`
- Rewrite the runner stage to copy `.next/standalone` instead of the entire `node_modules`
- Typically cuts image size by 50–80%

## 3. Pin pnpm version
- **Impact:** Reproducibility
- Replace `pnpm@latest` with a specific version (e.g. `pnpm@9.15.0`) in both stages
- Alternatively, add a `packageManager` field to `package.json` and let corepack handle it

## 4. Change dummy DATABASE_URL from ENV to ARG
- **Impact:** Security hygiene
- `ENV` persists into subsequent stages and image metadata
- Switch to `ARG` so the dummy URL used for Prisma generation doesn't leak into the final image

## 5. Add non-root user
- **Impact:** Security
- Create a `nodejs` group and `nextjs` user in the runner stage
- Switch to it with `USER nextjs` before the `CMD` instruction

## 6. Remove devDependencies from production image
- **Impact:** Image size
- Currently the entire `node_modules` (including devDependencies like eslint, typescript, prisma, tsx) is copied to the runner
- Solved automatically by enabling standalone output (#2), or manually via `pnpm prune --prod`

## 7. Fix CLI strategy
- **Impact:** Correctness
- The CLI depends on `tsx` and `dotenv-cli`, both devDependencies
- Compile the CLI as a standalone script during the build stage so it works without devDeps at runtime
- Or maintain a separate Docker target/stage for CLI tasks

## 8. Copy tsconfig.json to runner stage
- **Impact:** Correctness
- The CLI runs TypeScript via `tsx`, which needs `tsconfig.json`
- If the CLI is compiled in #7, this becomes unnecessary

## 9. Add HEALTHCHECK instruction
- **Impact:** Operability
- Add a `HEALTHCHECK` to the Dockerfile for Docker and orchestration systems
- e.g. `wget --spider http://localhost:3000/` every 30s

## 10. Improve .dockerignore
- **Impact:** Build speed / context size
- Add entries: `.devcontainer`, `docker-compose.yml`, `Dockerfile`, `.env*`, `.vscode`, `.idea`
