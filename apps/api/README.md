# CloudWrkz API (`cloudwrkz-api`)

Rust (Axum, SQLx, PostgreSQL) HTTP API. Workspace package: `apps/api`.

## Run

```bash
# From repo root, with apps/api/.env and DATABASE_URL set:
cargo run -p cloudwrkz-api
```

CLI help and environment variables are printed by:

```bash
cargo run -p cloudwrkz-api -- --help
```

The same text is embedded as `HELP` in `src/lib.rs`.

## Documentation

| Topic | Doc |
| --- | --- |
| Background job queue, `github_link_metadata`, GitHub rate limits, `jobs` logging | [docs/background-jobs-and-github.md](../../docs/background-jobs-and-github.md) |
| Link detail page title display (Vite + Next.js) | [docs/link-detail-headlines.md](../../docs/link-detail-headlines.md) |

## Environment (high level)

- **Database**: `DATABASE_URL` (required).
- **GitHub enrichment** (optional): `GITHUB_TOKEN` or `GITHUB_API_TOKEN`; without a token, anonymous GitHub REST calls are capped per hour via `GITHUB_ANONYMOUS_MAX_REQUESTS_PER_HOUR` (default `60`). See the docs above.
- **Job concurrency**: `JOB_QUEUE_GITHUB_MAX_CONCURRENT` (default `1`).
- **Logging**: `LOG_VERBOSITY`, `RUST_LOG`, `LOG_FORMAT`; with `LOG_VERBOSITY=debug`, the default filter includes tracing target `jobs=debug` for the background worker.

Copy `apps/api/.env.example` to `apps/api/.env` for local development.

## Tests

Integration tests (need `DATABASE_URL`):

```bash
cd apps/api
DATABASE_URL=postgres://... cargo test
```
