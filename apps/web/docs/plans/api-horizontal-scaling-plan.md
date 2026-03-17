# API Horizontal Scaling Plan

This plan describes how to build and run the Cloudwrkz API so it **scales horizontally**: you can run multiple API instances behind a load balancer with no sticky sessions, and any instance can serve any request. It complements the [Backend–Website Separation Plan](./backend-website-separation-and-scaling-plan.md).

**Principle:** The API must be **stateless**. No request may depend on in-memory state that exists only on one instance. Shared, persistent state belongs in the **database** or a **shared store (e.g. Redis)**.

---

## 1. What “horizontal scaling” requires

| Requirement | Meaning |
|-------------|--------|
| **Stateless** | No in-memory session store; no per-instance caches that affect correctness. |
| **Shared auth** | Session/token validation uses a store all instances can read (DB or Redis). |
| **Shared file storage** | Uploads (avatars, favicons, ticket/task images) live in object storage or shared volume, not local disk. |
| **Shared rate limits** | Rate limiting (e.g. QR login) uses Redis or DB so all instances see the same counters. |
| **Shared real-time** | SSE/push (audit log, time-tracking events) uses Redis pub/sub (or similar) so any instance can publish and all connected clients receive. |
| **No local config** | Configuration via env vars (or a config service); no instance-specific files. |
| **DB connection pooling** | Each instance uses a bounded connection pool; total connections to DB stay under control (e.g. PgBouncer). |

---

## 2. Current state vs target (summary)

| Area | Current | Target for horizontal scaling |
|------|---------|-------------------------------|
| **Sessions** | Stored in DB (Prisma `Session` model). | ✅ Keep; any instance can validate by querying DB. |
| **Auth** | Cookie (session) + bearer token; session lookup in DB. | ✅ Keep; ensure no in-memory session cache. |
| **File uploads** | Local disk: `public/uploads/avatars`, `favicons`, `tickets`, `tasks`. | ❌ Move to **object storage** (S3 or S3-compatible); all instances read/write same store. |
| **Rate limiting** | Next.js `unstable_cache` (e.g. QR login rate limit) — per-instance. | ❌ Use **Redis** (or DB) for rate-limit counters so all instances share. |
| **SSE (audit log, time-tracking)** | In-memory `EventEmitter` singleton per process. | ❌ Use **Redis pub/sub**: publish on event; each instance subscribes and pushes to its SSE clients. |
| **App config** | Env + DB (e.g. system settings). | ✅ Env + DB is fine; no local files. |

---

## 3. Session and auth (already OK; keep it that way)

- **Sessions** are in the database (`Session` model). Any API instance can validate a cookie or token by querying the DB. Do **not** introduce an in-memory session cache that would make one instance the only one that “knows” a session.
- **Bearer tokens** for mobile: validate by looking up the session (or token store) in DB/Redis. Same rule: no per-instance cache for auth.
- **Recommendation:** Keep session validation as a **DB (or Redis) lookup on every request** (or with a short TTL cache backed by DB/Redis so all instances share the same cache store if you add one later).

---

## 4. File storage: object storage (required)

**Problem:** Today avatars, favicons, and ticket/task images are written to local disk (`public/uploads/...`). With multiple API instances, each has its own disk; a user might hit instance A to upload and instance B to view, and B doesn’t have the file.

**Solution:** Use **object storage** (e.g. AWS S3, MinIO, Cloudflare R2, or any S3-compatible API) as the single store for uploads.

**Scope:**

1. **Choose a provider** (e.g. S3, R2, MinIO). Configure bucket and credentials via env (e.g. `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or equivalent).
2. **Implement a small storage abstraction** (e.g. `packages/storage` or `src/server/storage`):
   - `upload(key: string, body: Buffer, contentType: string): Promise<string>` → returns public URL or path.
   - `getPublicUrl(key: string): string` (or signed URL if private).
   - Implementation: S3 client (`@aws-sdk/client-s3` or `minio`). For local dev, can still use local disk or MinIO in Docker.
3. **Migrate upload routes** to use this abstraction:
   - Avatar: `POST /api/profile/upload-avatar` (or equivalent) → write to e.g. `avatars/{userId}-{timestamp}.jpg` in bucket; save URL in `User.avatar`.
   - Favicons: write to e.g. `favicons/{hash}.png`; store URL in `Link.favicon`.
   - Ticket/task images: same pattern; store URL in ticket/todo attachment or rich text.
4. **Serving:** Either bucket is public (CDN in front) and you store the public URL, or you generate **signed URLs** from the API for private buckets. Do not serve files from API instances’ local disk.
5. **Migration:** One-time job: copy existing files from `public/uploads/` to object storage and update DB references to the new URLs. After that, new uploads go only to object storage.

**Files to touch (current app):**

- `src/app/api/profile/upload-avatar/route.ts`
- `src/app/api/links/upload-favicon/route.ts`
- `src/app/api/tickets/upload-image/route.ts`
- `src/app/api/todos/upload-image/route.ts`
- `src/lib/utils/favicon-cache.ts` (and any code that writes under `public/uploads/`)
- Remove or redirect routes that serve from `public/uploads/` (e.g. `src/app/api/profile/avatar/[filename]/route.ts`, `src/app/uploads/favicons/[filename]/route.ts`) in favor of object-storage URLs or a single “signed URL” endpoint.

**Result:** All instances see the same files; no instance-local disk for user content.

---

## 5. Rate limiting: shared store (Redis or DB)

**Problem:** QR login rate limit uses Next.js `unstable_cache`, which is per-instance. With N instances, a client could send N× the intended rate by hitting different instances.

**Solution:** Store rate-limit counters in a **shared store** so every instance reads/writes the same limits.

**Options:**

- **Redis (recommended):** Fast, atomic increments, TTL. Use a key like `ratelimit:qr-login:{clientId}:{minute}` and increment with expiry. All API instances use the same Redis.
- **Database:** Table or row with (identifier, window_start, count). Slower but no new dependency. Use for low-throughput limits.

**Scope:**

1. Introduce **Redis** (or decide on DB-only for rate limits). Env: `REDIS_URL` (or equivalent).
2. **QR login rate limit:** Replace `unstable_cache` + in-memory logic with Redis:
   - On each QR login request, increment key per client (e.g. IP or session) per time window (e.g. 1 minute).
   - If count > configured max, return 429. Set TTL on the key so it expires.
3. **Other rate limits** (if any): Use the same Redis (or shared DB) pattern.
4. **API:** Use a small `packages/rate-limit` (or server util) that takes a key, limit, and window and returns whether the request is allowed; use it in the QR login route and any other rate-limited endpoints.

**Files to touch:**

- `src/server/lib/qr-login-rate-limit.ts` — replace Next cache with Redis (or DB) counter.
- QR login request route — call the new rate limiter before creating a request.
- Optional: middleware or wrapper that applies rate limiting to selected routes.

**Result:** Rate limits are enforced globally across all API instances.

---

## 6. Real-time (SSE): Redis pub/sub

**Problem:** Audit log and time-tracking live updates use an **in-memory** `EventEmitter`. Only the instance that received the HTTP request for the SSE connection has the listener; only the instance that handled the mutation can emit. With multiple instances, clients on instance A never see events emitted on instance B.

**Solution:** Use **Redis pub/sub** so that:

- When something happens (e.g. audit log created, time entry updated), the instance that handled it **publishes** a message to a Redis channel.
- **Every** API instance **subscribes** to that channel and, when it receives a message, pushes it to its **local** SSE connections (the ones it holds). No need to share connection state; each instance only pushes to its own clients.

**Scope:**

1. **Redis client** in the API (e.g. `ioredis` or `redis`). Env: same `REDIS_URL`.
2. **Channels:** e.g. `audit-log:created`, `time-tracking:updated`. Message payload: JSON (e.g. `{ type, userId, log }` or `{ type, userId, entry }`).
3. **Publish:** Where you currently call `auditLogEvents.emit(...)` (in `writeAuditLog`) and where you emit time-tracking updates, **also** publish the same payload to the corresponding Redis channel. Keep the in-memory emit for single-instance compatibility during migration, or remove it once Redis is in place.
4. **Subscribe (per instance):** On API startup, subscribe to `audit-log:created` and `time-tracking:updated`. On message, call the same in-memory emitter (so existing SSE route code still works) or push directly to a list of SSE connections keyed by user/channel. That way, every instance receives the event and pushes to its own connected clients.
5. **SSE routes:** No change to the HTTP contract; they still open a stream and push events. The only change is where the events come from: Redis subscriber instead of only local emit.

**Implementation sketch:**

- **Publisher (e.g. in `writeAuditLog`):**  
  `await redis.publish('audit-log:created', JSON.stringify({ type: 'audit-log-created', log: ... }));`
- **Subscriber (e.g. in API bootstrap):**  
  `redis.subscribe('audit-log:created');`  
  `redis.on('message', (channel, message) => { auditLogEvents.emit('audit-log-created', JSON.parse(message)); });`
- Same pattern for `time-tracking:updated` and `timeTrackingEvents`.

**Files to touch:**

- `src/lib/utils/event-emitter.ts` — keep as-is for local dispatch; feed it from Redis subscriber.
- `src/lib/utils/audit-log-events.ts` — no change to export; subscriber will call `auditLogEvents.emit`.
- `src/server/utils/audit-log.ts` — after DB write and before/after in-memory emit, add Redis publish.
- Time-tracking: wherever you emit `time-entry-update`, add Redis publish.
- New: **Redis client and subscriber setup** (e.g. `src/server/redis.ts` or in API bootstrap). Start subscriber when the API process starts; subscribe to channels and forward to existing emitters.

**Result:** Any instance can publish; every instance pushes to its own SSE clients. Real-time works across multiple instances.

---

## 7. Database connections (pooling)

**Problem:** Each API instance opens a Prisma (or raw) connection pool. N instances × M connections per instance can exceed the DB’s max connections.

**Solution:**

1. **Limit connections per instance:** Configure Prisma’s connection pool (e.g. `connection_limit` in `DATABASE_URL` or in Prisma schema). Keep a small number per instance (e.g. 5–10).
2. **Use PgBouncer (or similar):** Put a connection pooler in front of PostgreSQL. API instances connect to PgBouncer; PgBouncer holds a smaller number of real DB connections. This lets you scale to many API instances without blowing the DB connection limit.
3. **No connection affinity:** Do not rely on DB connection identity (e.g. session variables) for correctness; any request can use any connection from the pool.

**Result:** You can run many API instances without exhausting the database.

---

## 8. Configuration and secrets

- **No instance-specific files:** Don’t rely on local config files that differ per instance. Use **environment variables** (or a remote config service) for everything that can vary (API URL, DB URL, Redis URL, S3 config, feature flags).
- **Secrets:** Use env or a secret manager (e.g. AWS Secrets Manager, Vault). Same secrets on all instances (no per-instance secrets for normal operation).
- **Result:** Any instance can start and behave the same; no “snowflake” instances.

---

## 9. Health checks and load balancing

- **Health endpoint:** Expose e.g. `GET /health` that returns 200 if the process is up and (optionally) if it can reach DB and Redis. Do **not** include instance-local state in the health response that would make a load balancer route only to one instance.
- **Load balancer:** Use a **stateless** LB (round-robin, least connections, or similar). **No sticky sessions** required for correctness; optional stickiness for SSE (so a client’s SSE connection stays on one instance) is acceptable for performance but not required if you use Redis pub/sub (any instance can serve the next request).
- **Result:** LB can send any request to any instance; instances are interchangeable.

---

## 10. Optional: idempotency for mutations

For critical mutations (e.g. payment, order, or “create ticket once”), **idempotency keys** help with retries and duplicate requests when multiple instances are in play:

- Client sends `Idempotency-Key: <uuid>` on POST/PATCH.
- API stores (e.g. in Redis or DB) “key → response + status” with a short TTL (e.g. 24h).
- If the same key is seen again, return the stored response without re-running the mutation.

This is optional but recommended for high-value or easy-to-duplicate operations.

---

## 11. Dependency summary

| Dependency | Purpose | Required for horizontal scaling |
|------------|---------|----------------------------------|
| **PostgreSQL** | Sessions, business data. | ✅ Already in use. |
| **Redis** | Rate limits, pub/sub for SSE, optional idempotency cache. | ✅ Add for multi-instance. |
| **S3-compatible storage** | Avatars, favicons, ticket/task images. | ✅ Add; replace local disk. |

---

## 12. Implementation order

1. **Sessions/auth** — Confirm no in-memory session cache; keep DB-backed validation. (Already OK.)
2. **File storage** — Introduce object storage and migrate upload routes + existing files. (Required before scaling.)
3. **Redis** — Add Redis; move rate limiting (e.g. QR login) to Redis. (Required before scaling.)
4. **Redis pub/sub for SSE** — Implement publish in audit log and time-tracking; subscribe in each instance and forward to existing emitters. (Required for correct real-time when scaling.)
5. **DB pooling** — Tune Prisma pool; add PgBouncer if you run many instances. (Required when instance count grows.)
6. **Health checks** — Ensure `/health` is stateless and LB can use it. (Quick win.)
7. **Idempotency** — Add for selected mutations if needed. (Optional.)

---

## 13. Checklist before adding more API instances

- [ ] Sessions/tokens validated via DB (or shared Redis); no in-memory session store.
- [ ] All user uploads (avatars, favicons, images) stored in object storage; no local disk.
- [ ] Rate limits use Redis (or shared DB).
- [ ] SSE (audit log, time-tracking) uses Redis pub/sub so all instances receive events.
- [ ] Config and secrets from env (or remote); no instance-specific files.
- [ ] DB connection pool per instance is bounded; PgBouncer (or similar) in front of DB if needed.
- [ ] Health endpoint is stateless; load balancer does not require sticky sessions for correctness.

---

*Document version: 1.0. Last updated: 2025-03-12.*
