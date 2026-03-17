# Cloudwrkz

Monorepo for the Cloudwrkz product: web application and iOS app. Single git repository, no submodules.

## Structure

| App        | Path        | Description                          |
|-----------|-------------|--------------------------------------|
| **Web**   | [apps/web](apps/web)   | Next.js 16 app (API, dashboard, Prisma, Docker) |
| **iOS**   | [apps/ios](apps/ios)   | Native iOS app (Swift, Xcode)        |

## Quick start

### From repo root

With pnpm installed at the repo root you can run web app commands via the root `package.json`:

```bash
pnpm install          # installs workspace (web app deps)
pnpm dev              # start web dev server
pnpm build            # build web app
pnpm db:studio        # open Prisma Studio for web app DB
```

These delegate to `apps/web`. See [apps/web/README.md](apps/web/README.md) for full web setup (PostgreSQL, `.env.local`, migrations).

### Web app (`apps/web`)

- **Stack**: Next.js 16, Tailwind, PostgreSQL, Prisma, pnpm
- **Setup**: `cd apps/web && pnpm install`, configure `.env.local`, start Postgres (e.g. `docker-compose up -d`), run `pnpm db:push` or `pnpm db:migrate`
- **Details**: [apps/web/README.md](apps/web/README.md)

### iOS app (`apps/ios`)

- **Stack**: Swift, Xcode
- **Setup**: Open `apps/ios/Cloudwrkz.xcodeproj` in Xcode and build/run. Configure the app’s server URL as needed.

## Tooling

- **Package manager**: pnpm; workspace is defined in [pnpm-workspace.yaml](pnpm-workspace.yaml) (currently only `apps/web`).
- **CI**: GitHub Actions under [.github/workflows](.github/workflows) (e.g. Docker image build for the web app with context `apps/web`).

## License

Proprietary.
