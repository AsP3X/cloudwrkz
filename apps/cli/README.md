# CloudWrkz CLI

Rust CLI for database and admin tasks. Port of the legacy Node/Prisma CLI’s DB commands, with **seed** integrated.

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

Then:

| Command | Description |
|--------|-------------|
| `cloudwrkz-cli db seed` | Run seed SQL (modules + permissions). Idempotent. |
| `cloudwrkz-cli db migrate` | Run pending SQLx migrations from `apps/api/migrations/`. |
| `cloudwrkz-cli db status` | Check DB connection and user count. |
| `cloudwrkz-cli db stats` | Print row counts for main tables. |

### Examples

```bash
# From repo root (default migrations dir: apps/api/migrations)
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
