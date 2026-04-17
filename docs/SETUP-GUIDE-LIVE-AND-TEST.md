# CloudWrkz — Setup Guide (Test & Live Host)

Step-by-step guide to set up the CloudWrkz project in a **test/development** environment and on a **production/live** host. The stack consists of:

- **Web** — Vite + React SPA (static assets, CDN-ready)
- **API** — Rust (Axum + SQLx) HTTP API
- **Database** — PostgreSQL 16
- **Optional** — pgAdmin for DB management; load balancer/reverse proxy in production

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Test / development environment](#2-test--development-environment)
3. [Live / production host](#3-live--production-host)
4. [Verification and testing](#4-verification-and-testing)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Prerequisites

### All environments

- **Git** — to clone the repository
- **Docker** and **Docker Compose** — to run PostgreSQL (and optionally the API) in containers
- **Node.js** ≥ 18 (LTS recommended) and **pnpm** ≥ 9 — for the web app
- **Rust** toolchain (optional for local API dev) — `rustup` with `stable`; required only if you run the API binary directly instead of via Docker

### Test environment only

- Docker Compose v2+
- (Optional) Rust + Cargo if you want to run the API without Docker

### Live host

- A host (VPS, cloud VM, or bare metal) with a public IP or domain
- **Reverse proxy** — Nginx, Caddy, or Traefik for HTTPS and routing to API and static web
- **SSL** — e.g. Let's Encrypt (Caddy/Nginx can handle this)
- (Recommended) A way to run long-lived processes — systemd, Docker, or an orchestration platform (e.g. Kubernetes)

---

## 2. Test / development environment

### Step 2.1 — Clone the repository

```bash
git clone <your-repo-url> Cloudwrkz
cd Cloudwrkz
```

**Docker Compose file:** the repo ships `docker-compose.yml.example`. From the repository root, either copy it once (`cp docker-compose.yml.example docker-compose.yml`) so plain `docker compose …` commands work, or pass `-f docker-compose.yml.example` on every command below. Builds expect that directory to contain `apps/` and the rest of the monorepo; if the compose file lives elsewhere, set `CLOUDWRKZ_REPO_ROOT` in `.env` to the absolute path of the clone.

### Step 2.2 — Set up the database (PostgreSQL)

**Option A: Docker Compose (recommended)**

From the **repository root**:

```bash
# Start PostgreSQL (and optionally pgAdmin)
docker compose up -d postgres

# Optional: start pgAdmin for DB management at http://localhost:5050
docker compose up -d postgres pgadmin
```

Default credentials:

- **PostgreSQL:** user `cloudwrkz`, password `cloudwrkz_dev_password`, database `cloudwrkz`, port `5432`
- **pgAdmin:** email `admin@cloudwrkz.test`, password `admin`

**Option B: Local PostgreSQL**

- Install PostgreSQL 16 and create a database and user, e.g.:

  ```sql
  CREATE USER cloudwrkz WITH PASSWORD 'your_password';
  CREATE DATABASE cloudwrkz OWNER cloudwrkz;
  ```

- Use this connection string in the next steps:
  `postgresql://cloudwrkz:your_password@localhost:5432/cloudwrkz`

### Step 2.3 — Run the API (Rust)

**Option A: Docker Compose**

From the **repository root**:

```bash
# Ensure postgres is running first
docker compose up -d postgres

# Build the API image (first time or after code changes; may take several minutes)
docker compose build api

# Start the API (runs migrations on startup)
docker compose up -d api
```

The API will:

- Use the image built by `docker compose build api`
- Run migrations from `apps/api/migrations/` on startup
- Listen on **http://localhost:8080**

To rebuild and restart after code changes: `docker compose build api && docker compose up -d api`.

**Option B: Run the API binary locally**

1. Install Rust: https://rustup.rs/
2. Create env file and start the API:

```bash
cd apps/api
cp .env.example .env
# Edit .env and set DATABASE_URL to your Postgres
# Optional: API_REGION=local (or e.g. eu-west-1) and API_NODES_AVAILABLE=1 — see "Environment variable reference"
cargo run -p cloudwrkz-api
```

On Windows PowerShell:

```powershell
Set-Location apps/api
Copy-Item .env.example .env
# Edit .env and set DATABASE_URL to your Postgres
# Optional: set API_REGION / API_NODES_AVAILABLE — see docs/SETUP-GUIDE-LIVE-AND-TEST.md
cargo run -p cloudwrkz-api
```

The API runs on **http://localhost:8080** (or the port set in `API_PORT`).

### Step 2.4 — Configure and run the Web app (Vite)

1. Install dependencies from the **repository root**:

```bash
pnpm install
```

2. Configure the web app to talk to the API:

```bash
cd apps/web-vite
cp .env.example .env
```

3. Edit `apps/web-vite/.env`:

- **If API is on the same machine (Docker or local binary):**
  - `VITE_API_URL=http://localhost:8080/api/v1`
- **If you use Vite's dev proxy** (see `vite.config.ts`), you can keep the default and ensure the proxy target is `http://localhost:8080`.

4. Start the dev server:

```bash
# From repo root
pnpm --filter web-vite dev
```

Or from `apps/web-vite`:

```bash
pnpm dev
```

The app will be at **http://localhost:5173**.

### Step 2.5 — Database seeding and Rust CLI

With the **Rust API**, seeding is done via SQL migrations. No separate Node/Prisma seed script is needed.

- **When it runs:** The API runs all migrations in `apps/api/migrations/` on startup (including the seed migration). So if you start the API with Docker Compose or `cargo run`, the database is seeded automatically after the schema is applied.
- **What gets seeded:** The migration `002_seed_data.sql` inserts:
  - **Modules:** `tickets`, `timetracking`, `todos`, `links` (all enabled so `/me` returns them).
  - **Permissions:** The full set of permission rows (e.g. `tickets.view`, `admin.db.view_entries`, `links.create`) required for the API and web UI.
- **Idempotent:** The seed uses `ON CONFLICT (key) DO UPDATE`, so re-running migrations (or restarting the API) will upsert and not duplicate rows.
- **Re-seed or run migrations via CLI (recommended):** A Rust CLI in `apps/cli` provides an executable that runs seed and other DB tasks. From **repo root** (with `DATABASE_URL` set, e.g. from `apps/api/.env`):
  ```bash
  cargo build --release -p cloudwrkz-cli
  export DATABASE_URL="postgresql://cloudwrkz:cloudwrkz_dev_password@localhost:5432/cloudwrkz"  # or use apps/api/.env
  ./target/release/cloudwrkz-cli              # Interactive menu (no args)
  ./target/release/cloudwrkz-cli db seed      # Run seed SQL only (idempotent)
  ./target/release/cloudwrkz-cli db migrate   # Run all pending migrations
  ./target/release/cloudwrkz-cli db status    # Check connection
  ./target/release/cloudwrkz-cli db stats     # Table row counts
  # Create first admin (when you have no admin yet; requires CLOUDWRKZ_BOOTSTRAP_SECRET):
  export CLOUDWRKZ_BOOTSTRAP_SECRET=local-dev
  ./target/release/cloudwrkz-cli admin create-admin admin@example.com "YourPassword" "Admin"
  ```
  On Windows PowerShell:
  ```powershell
  cargo build --release -p cloudwrkz-cli
  $env:DATABASE_URL = "postgresql://cloudwrkz:cloudwrkz_dev_password@localhost:5432/cloudwrkz"  # or use apps/api/.env
  .\target\release\cloudwrkz-cli.exe              # Interactive menu (no args)
  .\target\release\cloudwrkz-cli.exe db seed      # Run seed SQL only (idempotent)
  .\target\release\cloudwrkz-cli.exe db migrate   # Run all pending migrations
  .\target\release\cloudwrkz-cli.exe db status    # Check connection
  .\target\release\cloudwrkz-cli.exe db stats     # Table row counts
  # Create first admin (when you have no admin yet; requires CLOUDWRKZ_BOOTSTRAP_SECRET):
  $env:CLOUDWRKZ_BOOTSTRAP_SECRET = "local-dev"
  .\target\release\cloudwrkz-cli.exe admin create-admin admin@example.com "YourPassword" "Admin"
  ```
  See `apps/cli/README.md` for details. Alternatively, restart the API (Docker or `cargo run`) to apply pending migrations on startup.

### Step 2.6 — Quick sanity check (test env)

- **API health:** open http://localhost:8080/api/health — expect JSON with `"status": "healthy"` when DB is up.
- **API ping:** http://localhost:8080/api/ping — expect `{"ok": true, "server_processing_ms": …}` (handler time only, no DB).
- **Web:** open http://localhost:5173 — you should see the app; register or log in (hits the Rust API).

---

## 3. Live / production host

### Step 3.1 — Prepare the host

- Install Docker and Docker Compose (or your chosen runtime).
- Point a **domain** (e.g. `app.example.com`, `api.example.com`) to the host's IP (A/AAAA records).
- (Recommended) Use a reverse proxy with HTTPS (e.g. Caddy, Nginx, Traefik).

### Step 3.2 — Clone and configure environment

```bash
git clone <your-repo-url> /opt/cloudwrkz   # or your chosen path
cd /opt/cloudwrkz
```

Create a **production** env file (do not commit secrets):

```bash
# .env.production at repo root
POSTGRES_PASSWORD=<strong-random-password>
```

### Step 3.3 — Database on the live host

**Option A: Docker Compose (API + Postgres on same host)**

```bash
docker compose --env-file .env.production build api
docker compose --env-file .env.production up -d postgres
# Wait for postgres to be healthy, then:
docker compose --env-file .env.production up -d api
```

**Option B: Managed PostgreSQL**

- Create a PostgreSQL 16 instance (e.g. AWS RDS, DigitalOcean, Supabase).
- Note the connection string (e.g. `postgresql://user:pass@host:5432/cloudwrkz?sslmode=require`).
- The API runs migrations on startup automatically.

### Step 3.4 — API on the live host

**Option A: Docker**

Set production env for the API service:

- `CORS_ORIGINS=https://app.example.com`
- `COOKIE_DOMAIN=.example.com`
- `COOKIE_SECURE=true`
- `RUST_LOG=info`
- `DATABASE_URL` pointing at your Postgres
- (Optional) `API_REGION` — label for this API instance (e.g. `eu-west-1`); shown on `/health` and the public health page for future multi-region routing
- (Optional) `API_NODES_AVAILABLE` — how many API nodes this deployment reports (default `1` until you run multiple endpoints behind a global router)

```bash
docker compose --env-file .env.production build api
docker compose --env-file .env.production up -d api
```

**Option B: Binary + systemd**

1. Build the API on the host or in CI (from the **repository root**):

   ```bash
   cargo build --release -p cloudwrkz-api
   ```

   The binary is at **`target/release/cloudwrkz-api`** (workspace target is at repo root; if you ran from `apps/api`, use `../target/release/cloudwrkz-api`).

2. Copy `target/release/cloudwrkz-api` and `apps/api/migrations/` to the server.
   - If the server is Windows, the binary will be `target\release\cloudwrkz-api.exe`.

3. Create a systemd unit (e.g. `/etc/systemd/system/cloudwrkz-api.service`):

   ```ini
   [Unit]
   Description=CloudWrkz API
   After=network.target postgresql.service

   [Service]
   Type=simple
   ExecStart=/opt/cloudwrkz/cloudwrkz-api
   WorkingDirectory=/opt/cloudwrkz
   Environment=DATABASE_URL=postgresql://cloudwrkz:PASSWORD@localhost:5432/cloudwrkz
   Environment=API_HOST=0.0.0.0
   Environment=API_PORT=8080
   Environment=CORS_ORIGINS=https://app.example.com
   Environment=COOKIE_SECURE=true
   Environment=RUST_LOG=info
   # Optional: region label for /health (public status + future multi-region routing)
   Environment=API_REGION=eu-west-1
   # Optional: reported node count (1 = single API process)
   Environment=API_NODES_AVAILABLE=1
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

4. Enable and start:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now cloudwrkz-api
   ```

### Step 3.5 — Web app build and static hosting

1. **Build the web app** with the **production API URL**:

```bash
cd apps/web-vite
export VITE_API_URL="https://api.example.com/api/v1"
export VITE_APP_NAME="CloudWrkz"
pnpm build
```

2. **Deploy the contents of `dist/`** to your static host:

   - **Nginx:** copy `dist/` to e.g. `/var/www/cloudwrkz` and serve the folder; set `try_files $uri $uri/ /index.html` for SPA routing.
   - **Caddy:** point a `file_server` at the `dist/` directory.
   - **Object storage + CDN:** upload `dist/` to S3/R2/GCS and configure the CDN to use `index.html` for 404s (SPA fallback).

### Step 3.6 — Reverse proxy and HTTPS

**Example with Caddy** (automatic HTTPS via Let's Encrypt):

```text
api.example.com {
    reverse_proxy localhost:8080
}

app.example.com {
    root * /var/www/cloudwrkz
    file_server
    try_files {path} /index.html
}
```

**Example with Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    # SSL managed by certbot

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name app.example.com;
    # SSL managed by certbot

    root /var/www/cloudwrkz;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Step 3.7 — Production checklist

- [ ] `DATABASE_URL` uses a strong password and (if remote) `?sslmode=require`
- [ ] `CORS_ORIGINS` lists only your real web origin(s) (e.g. `https://app.example.com`)
- [ ] (Optional) `API_REGION` set per instance if you rely on `/health` or the public health page for region-aware status
- [ ] (Optional) `API_NODES_AVAILABLE` matches how many API backends your global router treats as available (usually `1` per process)
- [ ] `COOKIE_SECURE=true` and `COOKIE_DOMAIN` set if using cookies
- [ ] `VITE_API_URL` at build time points to the production API (e.g. `https://api.example.com/api/v1`)
- [ ] HTTPS everywhere; no API or web over plain HTTP in production
- [ ] Firewall: only 80/443 (and optionally 22) open; API port (8080) not exposed publicly if behind a reverse proxy
- [ ] Reverse proxy sets `X-Forwarded-For` / `Forwarded` from the edge only (trusted), so per-IP auth rate limits and logs see real clients
- [ ] Backups configured for PostgreSQL data volume

---

## 4. Verification and testing

### 4.1 — Health and readiness

| Check         | URL                          | Expected                              |
|--------------|-------------------------------|---------------------------------------|
| API health   | `GET /api/health` or `GET /api/v1/health` | `200` + JSON: `status`, `timestamp`, `api` (`version`, `environment`, `uptime_seconds`, `nodes_available`, optional `region`), `services.database` (`connected`, `response_time_ms` from `SELECT 1`, pool stats). Omits host/process/timings — public status only. |
| API health (detailed) | `GET /api/health/detailed` or `GET /api/v1/health/detailed` | `401` without `Authorization: Bearer <token>`. `200` + full diagnostics (host memory/disks, process/CPU, DB `version()`, timings, hostname, build info). Token: generate in **Admin → System Settings** or `cloudwrkz-api diagnostics-token generate` / `cloudwrkz-cli diagnostics-token generate`, or set `DIAGNOSTICS_HEALTH_TOKEN`. |
| API readiness| `GET /api/ready`             | `{"ready":true}`                      |
| API ping     | `GET /api/ping` or `GET /api/v1/ping` | `{"ok":true,"server_processing_ms":…}` — time inside the API handler only (no DB); use for liveness. Separate from `/health`. |

### 4.2 — Auth flow (curl examples)

**Register:**

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123","confirm_password":"password123"}'
```

Expected: `202 Accepted` with `{"message":"...","queued":true,"job_id":"...","retry_deadline_secs":30}`. The job runs in the background and retries transient DB errors for ~30s, so registration can still succeed if Postgres was briefly down when you posted. Poll `GET /api/v1/auth/register/status/{job_id}` until `status` is `completed` (then sign in) or `failed`.

**Login:**

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Expected: `202 Accepted` with `{"queued":true,"job_id":"...","retry_deadline_secs":30,...}`. Sign-in always runs asynchronously; transient DB errors retry for ~30s (same behavior as when the DB was only briefly unavailable). Poll `GET /api/v1/auth/login/status/{job_id}` until `status` is `completed` (response includes `token` and `user`) or `failed`.

**Me (authenticated):**

```bash
curl http://localhost:8080/api/v1/me \
  -H "Authorization: Bearer <token-from-login>"
```

Expected: `200 OK` with `{"name":"Test User","email":"test@example.com","modules":[...]}`

**Brute-force protection:** `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, and related `/auth/*` routes are rate-limited per client IP (`AUTH_RATE_LIMIT_PER_MINUTE`, `AUTH_RATE_LIMIT_BURST` in `apps/api/.env`). Excess traffic returns `429`. Behind a reverse proxy, forward a real client IP via `X-Forwarded-For` / `Forwarded` only from trusted hops so limits are meaningful.

**Response headers:** The API adds baseline security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`). A reverse proxy may add the same headers; either stack is fine, but avoid conflicting values in production.

### 4.2a — OpenAPI contract (clients)

A hand-maintained description of common `/api/v1` paths and shapes lives at **[openapi-v1.yaml](./openapi-v1.yaml)**. The Vite app and CLI currently encode URLs manually; use this file as a shared checklist when adding endpoints or validating payloads. It is not auto-generated from Rust yet—extend it when handlers change.

### 4.2b — Diagnostics token: choosing a CLI entry point

`cloudwrkz-api diagnostics-token generate` and `cloudwrkz-cli diagnostics-token generate` both hash and store a token in the database (same as **Admin → System Settings**). For **CI and deploy scripts**, pick one binary and document it in your runbook—**prefer `cloudwrkz-cli diagnostics-token generate`** when your pipeline already builds or ships the CLI, so token rotation does not depend on the full API server binary. Use the API binary’s subcommand when the CLI is not available in the image.

### 4.3 — Web app (manual)

1. Open the web app in a browser (test: http://localhost:5173; live: https://app.example.com).
2. Register a new user and log in.
3. Confirm dashboard loads and no console/network errors related to CORS or wrong API URL.

### 4.4 — API integration tests (Rust + PostgreSQL)

With PostgreSQL running and `DATABASE_URL` set (for example `source apps/api/.env` from the repo root):

```bash
cargo test -p cloudwrkz-api
```

This exercises the Axum router against a real database (migrations + HTTP checks): unauthenticated `/me`/`/admin/…`, session extraction, permission grants, security headers, and related wiring.

### 4.5 — Full test environment in one go

```bash
# Terminal 1: build and start everything (from repo root)
docker compose build api
docker compose up -d

# Terminal 2: start web dev server
pnpm install
cd apps/web-vite && cp .env.example .env && pnpm dev

# Terminal 3: verify
curl -s http://localhost:8080/api/health | python3 -m json.tool
curl -s http://localhost:8080/api/ping
```

---

## 5. Troubleshooting

### API won't start

- **"Failed to create database pool"** — Check `DATABASE_URL` (host, port, user, password, DB name). If Postgres is in Docker, use the service name `postgres` as host when the API runs in the same Compose stack.
- **"Failed to run migrations"** — Ensure the DB user has CREATE TABLE rights; check that `apps/api/migrations/` exists and is included in the Docker image or next to the binary.
- **Port 8080 in use** — Change `API_PORT` (and the Compose port mapping) to another port.

### Web app can't reach the API

- **Vite dev: ECONNRESET / socket hang up on `/api/v1/...`** — The Node proxy to the Rust API can drop connections (especially on Windows or when Postgres restarts). The API may still be fine. In `apps/web-vite/.env` set `VITE_API_URL=http://127.0.0.1:8080/api/v1` so the browser calls the API directly (empty `CORS_ORIGINS` on the API allows any origin in typical dev). Restart `pnpm dev`.
- **"Failed to fetch" with absolute `VITE_API_URL` and Network URL (e.g. `http://172.25.x.x:5173`)** — Was caused by `credentials: include` + `Access-Control-Allow-Origin: *` (browser blocks). The app now uses `omit` for cross-origin API calls (Bearer auth). If issues persist, add your page origin to `CORS_ORIGINS` on the API or use the localhost Vite URL.
- **CORS errors** — Add the exact origin of the web app (e.g. `http://localhost:5173` or `https://app.example.com`) to `CORS_ORIGINS` (comma-separated, no trailing slash).
- **401 on /me or after login** — Ensure the request includes `Authorization: Bearer <token>` and the token is from `/api/v1/auth/login`.
- **Wrong API URL** — Rebuild the web app with the correct `VITE_API_URL`; for production this must be set at **build** time (not runtime).

### Database connection from host to Docker

- From the host, use `localhost:5432` with the same user/password/database.
- If both API and Postgres are in the same Compose project, use hostname `postgres` and port `5432` in `DATABASE_URL`.

### Docker API healthcheck failing

- The default healthcheck uses `curl`. If the API image doesn't include it, add to the Dockerfile runtime stage:
  `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*`

### iOS or other clients

- Point the client's base URL to your API (e.g. `https://api.example.com`).
- Use the versioned paths: login at `POST /api/v1/auth/login`, me at `GET /api/v1/me`, with `Authorization: Bearer <token>`.

---

## Environment variable reference

### API (`apps/api/.env`)

| Variable          | Required | Default           | Description                                    |
|-------------------|----------|-------------------|------------------------------------------------|
| `DATABASE_URL`    | Yes      | —                 | PostgreSQL connection string                   |
| `API_HOST`        | No       | `0.0.0.0`        | Bind address                                   |
| `API_PORT`        | No       | `8080`            | Listen port                                    |
| `CORS_ORIGINS`    | Yes*     | —                 | Comma-separated allowed origins                |
| `COOKIE_DOMAIN`   | No       | —                 | Domain for session cookie                      |
| `COOKIE_SECURE`   | No       | `false`           | `true` in production (HTTPS only)              |
| `SESSION_MAX_AGE` | No       | `604800` (7 days) | Session TTL in seconds                         |
| `MAX_BODY_SIZE`   | No       | `10485760` (10MB) | Max request body in bytes                      |
| `RUST_LOG`        | No       | `info`            | Log level (e.g. `info`, `cloudwrkz_api=debug`) |
| `LOG_FORMAT`      | No       | (plain text)      | Set to `json` for one-JSON-object-per-line (for log aggregators) |
| `LOG_VERBOSITY`   | No       | `prod`            | `debug` = log all available info (client_ip, user_agent, path+query, content_length); `prod` = only required fields (request_id, method, path, status, latency_ms). Overridden by `-v` when running the binary directly. |
| `APP_ENV`         | No       | (from build)      | Optional deploy label surfaced as `api.environment` on `/health` (e.g. `staging`, `production`). Falls back from `RUST_ENV` or debug/release build. |
| `API_REGION`      | No       | —                 | Region ID for this instance (`api.region` on `/health`, public health UI). Use one value per geographic / logical region. |
| `API_NODES_AVAILABLE` | No  | `1`               | Reported number of API nodes for this deployment (`api.nodes_available` on `/health`). Keep `1` for a single process; raise when your global router exposes multiple healthy backends. |
| `DIAGNOSTICS_HEALTH_TOKEN` | No | —            | Optional plaintext Bearer token accepted for `GET …/health/detailed` (in addition to the hashed token in `system_settings`). Prefer generating via Admin Settings or CLI (see below). |
| `AUTH_RATE_LIMIT_PER_MINUTE` | No | `60` (clamped 6–600) | Sustained allowance for `/api/v1/auth/*` per IP (token bucket refill derived from this). |
| `AUTH_RATE_LIMIT_BURST` | No | `30` (clamped 1–300) | Burst size for auth routes before `429` responses. |

**Running the API binary:** You can control verbosity with `-v` (overrides env): `./cloudwrkz-api` = prod logging; `./cloudwrkz-api -v` or `./cloudwrkz-api -v debug` = debug/verbose; `./cloudwrkz-api -v prod` = prod. **Deployment overrides (also in `apps/api/.env`):** `--region <ID>` or `--region=<ID>` sets the same value as `API_REGION`; `--api-nodes <N>` or `--api-nodes=<N>` overrides `API_NODES_AVAILABLE`. CLI wins over env when passed. **Diagnostics token (no HTTP server):** `cloudwrkz-api diagnostics-token generate` and `cloudwrkz-cli diagnostics-token generate` are equivalent (DB hash + one-time plaintext). For CI/deploy scripts, standardize on whichever binary you ship—often **`cloudwrkz-cli diagnostics-token generate`**. Use `./cloudwrkz-api --help` for server options.

**Monitoring:** The API logs at INFO by default: startup, listen address, and each HTTP request. Each request gets a `request_id` (from header `X-Request-ID` or generated). **LOG_VERBOSITY**: use `prod` (default) in production to log only required fields; use `debug` for full request/response details (client_ip, user_agent, path+query, response content_length). Use `RUST_LOG=debug` for more crate-level detail. Set `LOG_FORMAT=json` in production for NDJSON with `timestamp` (UTC RFC3339), `level`, `target`, `message`, and event fields flattened for log analyzers (Datadog, ELK, Splunk, CloudWatch).

### Web (`apps/web-vite/.env`)

| Variable           | Required | Default        | Description                                                       |
|--------------------|----------|----------------|-------------------------------------------------------------------|
| `VITE_API_URL`     | Yes      | `/api/v1`      | API base URL (set at build)                                       |
| `VITE_SEARCH_API_URL` | No    | `/next-api`    | Search/API bridge base URL used by web-vite search features       |
| `VITE_APP_NAME`    | No       | `CloudWrkz`    | App name in UI                                                    |
| `VITE_LOG_LEVEL`   | No       | `info` (dev), `warn` (prod) | Log level: `trace`, `debug`, `info`, `warn`, `error`, `silent` |
| `VITE_LOG_FORMAT`  | No       | `text`         | Set to `json` for NDJSON (one JSON object per line) for log tools  |

---

## Summary

| Environment | Database         | API                    | Web                                  |
|-------------|------------------|------------------------|--------------------------------------|
| **Test**    | Docker Postgres  | Docker or `cargo run`  | `pnpm dev` (Vite dev server)         |
| **Live**    | Docker or managed| Docker or systemd      | Build `pnpm build`; serve `dist/` via Nginx/Caddy/CDN |
