# Background jobs and GitHub link metadata

This document describes the global `background_jobs` queue, the `github_link_metadata` job type, GitHub REST rate limiting, and related configuration. It reflects the current Rust API behavior (`apps/api`).

## Job queue worker

- A supervisor keeps **N dispatcher loops** running (`JOB_QUEUE_WORKER_COUNT` at boot, or `system_settings.job_queue_worker_count` at runtime). Each dispatcher polls PostgreSQL and **spawns a separate async task per claimed job** so multiple jobs can run concurrently.
- Poll sleep is **adaptive**: short while work is being claimed (low start latency under load) and exponentially backed off while idle (lower DB churn when the queue is empty).
- **Per job type**, `TypeBudgets` enforces **`max_concurrent`** (and optional `min_interval_between_starts` when configured on that type). Unknown types default to a generous concurrent cap; always check `policies_from_config` for each type.
- For **`github_link_metadata`**, `JOB_QUEUE_GITHUB_MAX_CONCURRENT` (default **1**) caps how many of these jobs run at once. Raise only if you accept more parallel GitHub traffic from this process.

## Throughput tuning checklist

- Increase **dispatcher count** when claim/dequeue is the bottleneck: set `JOB_QUEUE_WORKER_COUNT` (env default) and/or persist `system_settings.job_queue_worker_count` via admin settings.
- Increase **per-type `max_concurrent`** only for handlers proven safe to run in parallel. `ticket_create` stays at `1` intentionally to preserve ordering/serialization.
- Tune DB capacity alongside worker concurrency: if jobs queue behind `PgPool` acquisition, raise pool size or reduce concurrent job pressure.

## `github_link_metadata` jobs

- **Enqueue**: Creating or refreshing GitHub links can enqueue a job (see API routes under `links`). Duplicate pending/processing jobs for the same link are avoided via `dedupe_key`.
- **Claim**: Pending jobs are claimed with a normal `UPDATE … SET status = 'processing'` (same pattern as other job types). There is **no** “one start per UTC minute” rule in SQL.
- **Handler**: Loads the link URL, parses `owner/repo`, calls GitHub REST to enrich `links.metadata` with `github*` fields, then marks the job completed or failed.

## GitHub REST rate limiting (process-wide)

Without a GitHub token, GitHub allows roughly **60 REST requests per hour per IP** for unauthenticated use. The API enforces a **rolling one-hour window** counting each **HTTP GET** to `api.github.com`:

- **`GITHUB_ANONYMOUS_MAX_REQUESTS_PER_HOUR`** (default **60**) sets the cap for this process when no token is set.
- **`GITHUB_TOKEN`** or **`GITHUB_API_TOKEN`**: if set to a non-empty value, the in-process hourly counter is **not** applied; requests include `Authorization: Bearer …`. Authenticated quotas are enforced by GitHub (typically much higher than 60/hour).

There is **no** fixed delay between requests inside a job. A single enrichment run issues several GETs (typically: one repo, one or two branch list requests depending on pagination, then releases and commits **in parallel** as two GETs). Each GET consumes **one** slot; the parallel step consumes **two** slots before sending. If the window is full, **`acquire`** **waits** (async sleep) until old timestamps fall out of the hour—work may appear “stuck” in **`processing`** while waiting for quota, not as `pending`.

## Logging (debug)

- Tracing target **`jobs`**: `jobs.daemon_ready`, `jobs.daemon_wake`, `jobs.job_start`, `jobs.job_done` (see `apps/api/src/job_queue/mod.rs`).
- With **`LOG_VERBOSITY=debug`**, the default `RUST_LOG` filter includes **`jobs=debug`** so these lines appear without setting `RUST_LOG` manually.
- With **`LOG_VERBOSITY=prod`**, use e.g. **`RUST_LOG=info,jobs=debug`** to enable only the job queue debug lines.

## Permissions

- **`admin.jobs.view`**: Required for `GET /admin/background-jobs` and `GET /admin/background-jobs/{id}` (admin UI: Jobs queue and detail). **Not** implied by `admin.settings.manage`; assign both if someone should manage settings and inspect jobs.
- **`search.jobs.view`**: Reserved for a later feature: include background jobs in **global fuzzy search**. Until that is implemented, assign this permission only if you want to prepare groups/users for the future behavior.

Migration **`010_grant_admin_jobs_view_where_settings_manage`** grants `admin.jobs.view` everywhere `admin.settings.manage` was already assigned, so existing deployments keep prior access after this split.

## Admin API (job types)

`GET` admin background-jobs listing includes **`typePolicies.github_link_metadata`**, for example:

- **`maxConcurrent`**: `JOB_QUEUE_GITHUB_MAX_CONCURRENT`
- **`githubAnonymousMaxRequestsPerHour`**: anonymous cap
- **`githubApiTokenConfigured`**: boolean (token present), never the secret
- **`githubUtcMinuteStartSlot`**: always **false** (legacy field; minute-based start is removed)

## See also

- [Link detail page headlines](./link-detail-headlines.md) (web apps)
- `cloudwrkz-api --help` / `HELP` string in `apps/api/src/lib.rs` for the full environment variable list
