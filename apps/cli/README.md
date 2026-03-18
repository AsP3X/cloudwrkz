# CloudWrkz CLI

Rust CLI for database and admin tasks. Port of the legacy Node/Prisma CLI’s DB commands, and **interactive mode** (menu-driven interface).

## Build

From **repo root** (workspace includes `apps/cli`):

```bash
cargo build --release -p cloudwrkz-cli
```

Binary: `target/release/cloudwrkz-cli`.

## Usage

Set `DATABASE_URL` (e.g. from `apps/api/.env` or export). From **repo root**:

```bash
export DATABASE_URL="postgresql://cloudwrkz:cloudwrkz_dev_password@localhost:5432/cloudwrkz"

# Or use api .env
cd apps/api && source .env 2>/dev/null; cd ../.. 
```

### Interactive mode

Run with **no arguments** to start the interactive management console (same idea as the Node CLI's `pnpm cli`):

```bash
./target/release/cloudwrkz-cli
```

Main menu: **User Management**, **Group Management**, **Module Management**, **Session Management**, **Database**, Help, Quit.

- **Users, Groups, Modules, Sessions** use the HTTP API. You must be logged in: set `CLOUDWRKZ_TOKEN` (see [Login](#login) below). Optionally set `CLOUDWRKZ_API_URL` (default: `http://localhost:8080/api/v1`).
- **Database** runs local DB tasks (status, migrate, seed, stats) and only needs `DATABASE_URL`.

### Create first admin (bootstrap)

If you have no admin account yet (e.g. fresh install), you can't use the API to create one. Use the CLI to create an admin **directly in the database** (bypasses API and permissions).

**Safeguards against misuse:**

1. **Bootstrap secret required** — You must set `CLOUDWRKZ_BOOTSTRAP_SECRET` (any non-empty value). This prevents creating admins when only `DATABASE_URL` is leaked or available (e.g. in CI). In production use a strong random secret; for local dev any value (e.g. `local-dev`) is fine.
2. **First admin only** — If any admin already exists, the command refuses to run. Create additional users via the API or web app.

```bash
# From repo root; DATABASE_URL must be set (e.g. from apps/api/.env)
export CLOUDWRKZ_BOOTSTRAP_SECRET=your-secret-here   # required
./target/release/cloudwrkz-cli admin create-admin admin@example.com "YourSecurePassword" "Admin Name"
```

Then log in with that account (`cloudwrkz-cli login` or the web app) and use the management menus or create more users via the API.

### Login

To use the management menus (users, groups, modules, sessions), get a session token and set it:

```bash
# Log in (prompts for email/password, or use env vars)
cloudwrkz-cli login
# Or: CLOUDWRKZ_LOGIN_EMAIL=admin@example.com CLOUDWRKZ_LOGIN_PASSWORD=xxx cloudwrkz-cli login

# Then export the token it prints:
export CLOUDWRKZ_TOKEN="<token>"
```

After that, run `cloudwrkz-cli` again and use the User / Group / Module / Session menus.

### Non-interactive (direct commands)

| Command | Description |
|--------|-------------|
| `cloudwrkz-cli admin create-admin <email> <password> [name]` | Create **first** admin in DB (requires `CLOUDWRKZ_BOOTSTRAP_SECRET`; refuses if an admin exists). |
| `cloudwrkz-cli login` | Log in and print session token (for `CLOUDWRKZ_TOKEN`). |
| `cloudwrkz-cli db seed` | Run seed SQL (modules + permissions). Idempotent. |
| `cloudwrkz-cli db migrate` | Run pending SQLx migrations from `apps/api/migrations/`. |
| `cloudwrkz-cli db status` | Check DB connection and user count. |
| `cloudwrkz-cli db stats` | Print row counts for main tables. |

### Examples

```bash
# Interactive mode (menu-driven)
./target/release/cloudwrkz-cli

# Login to get a token for management menus
./target/release/cloudwrkz-cli login
export CLOUDWRKZ_TOKEN="<paste token>"

# Create first admin (when you have no admin yet; set bootstrap secret first)
export CLOUDWRKZ_BOOTSTRAP_SECRET=local-dev
./target/release/cloudwrkz-cli admin create-admin admin@example.com "SecurePassword" "Admin"

# Database (from repo root; DATABASE_URL from apps/api/.env if set)
./target/release/cloudwrkz-cli db seed
./target/release/cloudwrkz-cli db status
./target/release/cloudwrkz-cli db stats

# Custom migrations dir
MIGRATIONS_DIR=/path/to/migrations ./target/release/cloudwrkz-cli db migrate
```

## Seed

`db seed` runs `apps/api/migrations/002_seed_data.sql` (same file used by the API on startup). It inserts/updates:

- **Modules:** tickets, timetracking, todos, links (all enabled).
- **Permissions:** full set used by the API and web UI.

Re-running is safe (upsert by key).
