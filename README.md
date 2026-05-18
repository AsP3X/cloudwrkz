# Cloudwrkz

Monorepo for the Cloudwrkz product: **Vite + Rust API** stack, **Next.js** app, **Rust CLI**, and **iOS** app. Single git repository, no submodules.

## Structure


| Component         | Path                           | Description                                                                                                                                              |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web (Vite)**    | [apps/web-vite](apps/web-vite) | React SPA, Tailwind; talks to the Rust API                                                                                                               |
| **API**           | [apps/api](apps/api)           | Rust (Axum, SQLx, PostgreSQL); see [apps/api/README.md](apps/api/README.md) and [docs/background-jobs-and-github.md](docs/background-jobs-and-github.md) |
| **CLI**           | [apps/cli](apps/cli)           | Rust CLI for DB tasks, bootstrap admin, API-backed menus                                                                                                 |
| **Web (Next.js)** | [apps/web](apps/web)           | Next.js 16 app (Prisma, dashboard, Docker); legacy/alternate UI                                                                                          |
| **iOS**           | [apps/ios](apps/ios)           | Native iOS app (Swift, Xcode)                                                                                                                            |


## Prerequisites

- **Node.js** ≥ 25.2.0 ([apps/web/.nvmrc](apps/web/.nvmrc) pins the recommended version)
- **pnpm** ≥ 9 — enable via Corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **Docker** and **Docker Compose** (v2: `docker compose`) — local PostgreSQL, optional API container
- **Rust** (stable) — only if you build or run `apps/api` and `apps/cli` on the host instead of using the API container

## Quick start (local API + Vite)

### Prerequisites

- **Node.js** ≥ 25.2.0, **pnpm** ≥ 9, **Rust** (stable), **Docker** (for PostgreSQL)
- Optional: Git Bash or WSL on Windows to run `./init-env.sh` (or use `init-env.ps1` in PowerShell)

### Install and configure

From the repository root:

```bash
git clone <repository-url> cloudwrkz
cd cloudwrkz
pnpm install
```

Create local env files (copies `*.env.example` and fills `GENERATE_ME` secrets such as `CLOUDWRKZ_BOOTSTRAP_SECRET` for the CLI):

```bash
# macOS / Linux / Git Bash
./init-env.sh

# Windows PowerShell
./init-env.ps1
```

Start PostgreSQL (from a Compose file in the repo root):

```bash
cp docker-compose.yml.example docker-compose.yml
docker compose up -d postgres
```

### Start everything

```bash
pnpm run dev
```

- **API** → [http://localhost:8080/api/health](http://localhost:8080/api/health)
- **Web (Vite)** → [http://localhost:5173](http://localhost:5173)

On a **fresh database**, the app redirects to **`/setup`**. Complete the wizard to create the first admin account, then sign in to the dashboard. You can still use the CLI (`cloudwrkz-cli admin create-admin`) when the UI is not available — see [apps/cli/README.md](apps/cli/README.md).

### Start services individually

```bash
pnpm run dev:api    # Rust API only
pnpm run dev:vite   # Vite SPA only
```

### Docker: init env + full stack

```bash
docker compose --profile init run --rm init-env
docker compose up -d
pnpm run dev:vite   # optional: Vite on the host while API runs in Docker
```

---

## Setup (reference)

### 1. Clone and install JavaScript dependencies

Same as **Quick start** above (`pnpm install`).

### 2. Environment files

Prefer **`init-env.sh`** / **`init-env.ps1`** instead of manual copies. To configure by hand:


| App         | Action                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API**     | Copy [apps/api/.env.example](apps/api/.env.example) to `apps/api/.env` and adjust if needed. Defaults match the root Compose Postgres credentials. |
| **Vite**    | Copy [apps/web-vite/.env.example](apps/web-vite/.env.example) to `apps/web-vite/.env`. Defaults proxy `/api/v1` to the API on port 8080.           |
| **Next.js** | Copy `apps/web/.env.example` to `apps/web/.env.local` — see [apps/web/README.md](apps/web/README.md).                                              |
| **CLI**     | Optional: copy [apps/cli/.env.example](apps/cli/.env.example) to `apps/cli/.env` for tokens and local overrides.                                   |


### 3. Database and API (recommended: Docker Compose from repo root)

From the **repository root**, create a local Compose file (gitignored) from the example, then start the stack:

```bash
cp docker-compose.yml.example docker-compose.yml
docker compose up -d
```

Alternatively, use the example file directly: `docker compose -f docker-compose.yml.example up -d` (no `cp` needed). The compose file must sit in the **clone root** (next to `apps/`). If you keep it in another directory, set `CLOUDWRKZ_REPO_ROOT` in `.env` to the absolute path of the clone.

This starts:

- **PostgreSQL** on port `5432` (user `cloudwrkz`, database `cloudwrkz`, default password `cloudwrkz_dev_password` unless you set `POSTGRES_PASSWORD`)
- **Rust API** on port `8080` (applies SQLx migrations on startup)
- **Vite dev server** on port `5173` (custom image: Node + bundled `**cloudwrkz-cli`** on `PATH`; dependencies baked in the image — rebuild after changing app deps)
- **pgAdmin** on port `5050` (default login `admin@example.com` / `admin`)

Check API health: [http://localhost:8080/api/health](http://localhost:8080/api/health).

`**cloudwrkz-cli` inside the Vite container** (after `docker compose up -d`), e.g. first admin bootstrap — use `postgres` as the DB host:

```bash
docker compose exec -e CLOUDWRKZ_BOOTSTRAP_SECRET=local-dev -e DATABASE_URL="postgresql://cloudwrkz:cloudwrkz_dev_password@postgres:5432/cloudwrkz" web-vite cloudwrkz-cli admin create-admin you@example.com "YourPassword" "Your Name"
```

To stop: `docker compose down`. To remove data volumes: `docker compose down -v`.

### 4. Run the Vite web app

From the repository root:

```bash
pnpm dev:vite
```

Open [http://localhost:5173](http://localhost:5173). The dev server proxies API requests to `http://127.0.0.1:8080` when `VITE_API_URL` is the default `/api/v1`.

**Run the API on the host instead of Docker:** from the repo root, with `apps/api/.env` present:

```bash
cargo run -p cloudwrkz-api
```

Ensure Postgres is reachable at the `DATABASE_URL` in that file (e.g. after `docker compose up -d postgres` only, or a local Postgres instance).

### 5. First admin account (bootstrap)

**Recommended:** open the Vite app after `pnpm run dev`; on an empty database you are sent to **`/setup`** to create the admin in the browser.

**Alternative (CLI):** with the database up, create the first admin (requires a bootstrap secret — see [apps/cli/README.md](apps/cli/README.md)).

**From the host** (after `cargo build --release -p cloudwrkz-cli`):

```bash
cargo build --release -p cloudwrkz-cli
export CLOUDWRKZ_BOOTSTRAP_SECRET=local-dev
./target/release/cloudwrkz-cli admin create-admin you@example.com "YourPassword" "Your Name"
```

**Or entirely in Docker** (use the bundled CLI in the `web-vite` service — see the `docker compose exec …` example in the Docker Compose list in **§3** above).

On **Windows** (PowerShell), after `cargo build`:

```powershell
$env:CLOUDWRKZ_BOOTSTRAP_SECRET = "local-dev"
.\target\release\cloudwrkz-cli.exe admin create-admin you@example.com "YourPassword" "Your Name"
```

### 6. Next.js app (`apps/web`) — optional

Uses Prisma and its own Docker Compose under `apps/web` for local Postgres (or align `DATABASE_URL` with the root stack). Full steps: [apps/web/README.md](apps/web/README.md).

Root scripts still target the Next.js package as `web`:

```bash
pnpm dev              # Next.js dev server
pnpm build            # Next.js production build
pnpm db:studio        # Prisma Studio
```

### 7. iOS app

Open [apps/ios/Cloudwrkz.xcodeproj](apps/ios/Cloudwrkz.xcodeproj) in Xcode and build/run. Point the app at your API base URL as needed.

## Quick reference (repo root)


| Command                                                                        | Description                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`                                                                     | Next.js dev server (`apps/web`)                                     |
| `pnpm dev:vite`                                                                | Vite dev server (`apps/web-vite`)                                   |
| `pnpm build` / `pnpm build:vite`                                               | Production builds                                                   |
| `pnpm db:*`                                                                    | Prisma commands for `apps/web` (generate, push, migrate, studio, …) |
| `cp docker-compose.yml.example docker-compose.yml` then `docker compose up -d` | Postgres + API + pgAdmin (see §3)                                   |
| `cargo run -p cloudwrkz-api`                                                   | Run API locally                                                     |
| `cargo build --release -p cloudwrkz-cli`                                       | Build CLI binary                                                    |


## Documentation

Index: **[docs/README.md](docs/README.md)**

- **[Background jobs and GitHub metadata](docs/background-jobs-and-github.md)** — job queue, `github_link_metadata`, rate limits, `jobs` tracing.
- **[Link detail headlines](docs/link-detail-headlines.md)** — how link titles are shown on detail pages (Vite + Next.js).
- **API** — [apps/api/README.md](apps/api/README.md) (run, env overview, links to the docs above).

## Tooling

- **JavaScript**: pnpm workspace in [pnpm-workspace.yaml](pnpm-workspace.yaml) (`apps/web`, `apps/web-vite`).
- **Rust**: Cargo workspace in [Cargo.toml](Cargo.toml) (`apps/api`, `apps/cli`).
- **CI**: GitHub Actions under [.github/workflows](.github/workflows).

## License

Proprietary.