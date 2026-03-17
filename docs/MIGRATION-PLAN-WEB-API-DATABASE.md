# Cloudwrkz: Migration Plan — Web (Vite+), API (Rust), Database

This document outlines a comprehensive plan to split the current Next.js full-stack app into three distinct, scalable parts: **Web** (Vite+), **API** (Rust), and **Database** (PostgreSQL). The Web UI stays the same; the backend and build tooling change to meet horizontal and vertical scalability goals.

---

## 1. Current State Summary

| Layer | Current | Purpose |
|-------|---------|--------|
| **Web** | Next.js 16 (App Router), React 18, TypeScript, Tailwind, Prisma | Single app: UI + API routes + server actions |
| **API** | Next.js API routes (`/api/*`) + server actions | Serves Web and iOS; talks to DB via Prisma |
| **Database** | PostgreSQL 16, Prisma ORM | Single `DATABASE_URL`; migrations via Prisma |
| **iOS** | Swift app | Calls same Next.js origin (e.g. `/api/auth/login`, tickets, links, time-tracking, todos) |

**Entry points today:** `next dev` / `next start` (one Node process); Docker Compose: `cloudwrkz` app + `postgres` (+ optional pgAdmin).

---

## 2. Target Architecture (High Level)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     Load balancer / Ingress              │
                    └─────────────────────────────────────────────────────────┘
                                          │                 │
                    ┌─────────────────────▼─────┐   ┌───────▼──────────────────┐
                    │  Web (Vite+ SPA)          │   │  API (Rust)               │
                    │  - Static assets (CDN)   │   │  - Stateless HTTP API     │
                    │  - Same UI (React)       │   │  - Auth, tickets, links,  │
                    │  - No server runtime     │   │    time-tracking, todos…  │
                    │  - Horizontally scaled   │   │  - Horizontally scaled    │
                    │    via replicas/CDN     │   │    (N instances)          │
                    └─────────────────────────┘   └───────────┬────────────────┘
                                                              │
                                                              │ Connection pool
                                                              ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │  Database (PostgreSQL)                                   │
                    │  - Single primary (or managed service)                    │
                    │  - Optional read replicas for vertical/read scaling       │
                    │  - Migrations owned by API / separate migration runner  │
                    └─────────────────────────────────────────────────────────┘
```

- **Web**: Front-end only. No Node server in production; static build served from CDN or multiple static hosts. Horizontally scalable by adding more edge nodes; vertically by increasing resources of the serving layer if needed.
- **API**: Single responsibility: HTTP API for Web and iOS. Stateless Rust service; scale horizontally by adding instances behind a load balancer; vertically by increasing CPU/memory per instance.
- **Database**: Shared data store. Scale vertically (bigger instance); optionally add read replicas for read-heavy workloads.

---

## 3. Part 1 — Web (Vite+)

### 3.1 Goals

- **Rewrite** the web app using [Vite+](https://viteplus.dev) so that the **UI stays the same** (same pages, components, and UX).
- **Remove** all server-side logic from the web app: no API routes, no server actions, no Prisma. The web app becomes a **client-only SPA** that talks to the new Rust API.
- **Keep** React, TypeScript, Tailwind, and existing UI libraries (e.g. Recharts, TipTap, react-hook-form, Zod) where possible; replace Next.js-specific APIs (App Router, `fetch` to relative `/api`, server components, etc.) with Vite+ and explicit API client calls.

### 3.2 Vite+ Setup

- **Toolchain**: Use Vite+ for install, dev, build, check, test (`vp install`, `vp dev`, `vp build`, `vp check`, etc.). Vite+ manages Node and package manager; use one config for the frontend.
- **Framework**: Use **Vite + React** (Vite’s React template or official plugin). Vite+ supports “every framework built on Vite,” so React is a first-class choice.
- **Routing**: Replace Next.js App Router with **React Router** (or similar) to keep the same URL structure and page components.
- **Environment**: Replace `NEXTAUTH_*` and Next.js env with a single **API base URL** (e.g. `VITE_API_URL` or `VITE_APP_API_URL`) used by the API client. No server-side env in the web app.

### 3.3 Migration Steps (Web)

1. **Create new app** under the monorepo (e.g. `apps/web-vite` or replace `apps/web` in phases).
2. **Initialize** with Vite+ and React + TypeScript + Tailwind (align versions with current stack).
3. **Port layout and pages**: Move `app/` page structure to React Router routes; keep existing components, hooks, and styles (Tailwind, clsx, tailwind-merge).
4. **API client**: Introduce a central **API client** (e.g. `src/api/client.ts`) that:
   - Uses `import.meta.env.VITE_API_URL` (or similar) as base URL.
   - Sends session/token (cookie or `Authorization` header) on every request.
   - Mirrors current API surface (auth, me, tickets, todos, links, collections, time-tracking, search, etc.).
5. **Auth**: Replace server-side session with **token-based** flow:
   - Login/register call Rust API; store token (e.g. in memory + optional httpOnly cookie or secure storage).
   - All API requests include the token; 401 triggers redirect to login.
6. **Server actions → API calls**: Replace every server action with a call to the Rust API (same endpoints the iOS app will use).
7. **Static assets**: Ensure images, fonts, and public assets are served from the Vite build (`public/`, imports). No dependency on Next.js `public/` or `next/image`; use standard `<img>` or a small image helper if needed.
8. **Remove**: Next.js, Prisma, and any server-only code from the web app. Keep only UI and API client code.

### 3.4 Scalability (Web)

- **Horizontal**: Static build can be deployed to many origins (e.g. S3 + CloudFront, Netlify, Vercel static, or any CDN). Add more edge nodes or replicas as needed.
- **Vertical**: Scale the static hosting (e.g. larger cache, more bandwidth). No application server to scale.

---

## 4. Part 2 — API (Rust)

### 4.1 Goals

- **Implement** all current API surface in **Rust** so that both the **Web (Vite+)** and **iOS** clients can use the same HTTP API.
- **Stateless** service: no in-process session store; auth via tokens (e.g. session token in DB or JWT). Enables horizontal scaling (any instance can serve any request).
- **Single** entry point for all server-side logic: auth, tickets, todos, links, collections, time-tracking, search, admin, QR login, etc.

### 4.2 Recommended Stack (Rust)

- **HTTP framework**: **Axum** (async, ecosystem fit, good for JSON APIs and middleware).
- **Database**: **SQLx** (compile-time checked SQL, connection pooling, async) or **Diesel** (ORM, migrations). Recommendation: **SQLx** for flexibility and pooling; define migrations as SQL (can be derived from current Prisma schema).
- **Auth**: Session tokens stored in `sessions` table (same as today); validate token on each request; support cookie (web) and `Authorization: Bearer <token>` (iOS). Use **bcrypt** (or **argon2**) for password hashing.
- **Serialization**: **serde** (JSON). Optional: **OpenAPI** generation for docs and client generation.
- **Config**: Environment variables: `DATABASE_URL`, `API_PORT`, `API_HOST`, optional `RUST_LOG`, CORS origins, cookie domain, etc.

### 4.3 API Surface to Port

From the current `apps/web/src/app/api` structure, the Rust API must expose at least:

| Area | Endpoints (conceptual) |
|------|------------------------|
| **Auth** | `POST /api/login`, `POST /api/register`, session extend, change-password, QR login (request, approve, status) |
| **Me** | `GET /api/me`, `GET /api/auth/me` (current user) |
| **Tickets** | CRUD, list, upload-image, by id |
| **Todos** | CRUD, list, by id, upload-image |
| **Links** | CRUD, list, by id, metadata, upload-favicon, shared/collections |
| **Collections** | CRUD, list, members |
| **Time tracking** | add, by id, pause/resume/stop/complete, breaks, active, events |
| **Location history** | list, add (if any) |
| **Search** | `/api/search`, `/api/auth/search`, enhanced |
| **Profile** | avatar upload, preferences, profile/avatar/[filename] |
| **Contact** | contact form (e.g. POST) |
| **Admin** | audit events, purge-deleted-accounts, db-query, db-row (if still required) |
| **Health** | `GET /api/health`, `GET /api/ping` |
| **Favicons** | serve favicons by filename |

Preserve **request/response shapes** and **status codes** so that the existing Web and iOS clients can be adapted with minimal change (mainly base URL and auth header/cookie).

### 4.4 Project Layout (Rust API)

Suggested monorepo layout:

- **`apps/api`** (or `apps/api-rust`): Rust workspace.
  - `Cargo.toml` (workspace optional): binary crate for the HTTP server.
  - `src/main.rs`: bootstrap (DB pool, router, CORS, shutdown).
  - `src/routes/`: modules per area (auth, tickets, todos, links, time_tracking, search, admin, health).
  - `src/db/`: connection pool, queries or repository layer.
  - `src/models/`: structs matching DB (or generated); serde for JSON.
  - `src/auth/`: token validation, password hashing, optional JWT.
  - `migrations/`: SQL migrations (e.g. SQLx or Diesel migrations).

### 4.5 Scalability (API)

- **Horizontal**: Run **N** instances of the API behind a load balancer (e.g. Kubernetes, ECS, or plain reverse proxy). No local session state; DB and optional Redis (e.g. for rate limiting) are shared.
- **Vertical**: Increase CPU/memory per instance; use connection pooling (e.g. SQLx pool) with a bounded pool size per instance to avoid exhausting DB connections.

---

## 5. Part 3 — Database

### 5.1 Goals

- **Keep** PostgreSQL as the single source of truth. Schema is already defined in Prisma; it can be preserved and driven by **SQL migrations** maintained alongside the Rust API (or by a separate migration runner).
- **No** direct DB access from the Web app; only the **Rust API** (and optionally admin tooling/CLI) connects to the DB.
- **Compatibility**: Existing Prisma schema (`apps/web/prisma/schema.prisma`) can be used as the reference; export migrations to raw SQL and replay in the new pipeline if you move away from Prisma entirely.

### 5.2 Migration Strategy

- **Option A — Prisma for schema only**: Keep Prisma in the repo for schema and migration authoring; run `prisma migrate` from a small Node job or from the Rust app’s startup (call `prisma migrate deploy` via subprocess). Rust uses SQLx/Diesel to talk to the same DB. Duplicate source of truth (Prisma + Rust types) but minimal change to migration workflow.
- **Option B — Full handoff to Rust**: Export current schema to SQL (e.g. from Prisma’s migration history or `prisma db pull`), then maintain **all new migrations** as SQL in the Rust API repo (e.g. `apps/api/migrations/`). Use SQLx’s migration runner or Diesel migrations. Single source of truth in SQL + Rust types.

Recommendation: **Option B** long-term for a single stack (Rust); short-term **Option A** is acceptable if you want to keep Prisma during a transition.

### 5.3 Connection Pooling and Resilience

- **Pool**: Configure a **per-process** connection pool in the Rust API (e.g. SQLx `PgPoolOptions` with `max_connections`). Total connections ≈ `N_instances × max_connections`; set `max_connections` and instance count so that the sum stays within PostgreSQL’s `max_connections`.
- **Read replicas** (optional): For read-heavy endpoints (e.g. search, list tickets), use a read replica URL in Rust for read-only queries. Axum state can hold two pools (primary + replica) and route accordingly.

### 5.4 Scalability (Database)

- **Vertical**: Bigger instance (CPU, RAM, disk). Tune `shared_buffers`, `work_mem`, etc.
- **Horizontal (reads)**: Add PostgreSQL read replicas and direct read traffic from the API to replicas.

---

## 6. Monorepo and Repo Structure

Suggested layout:

```
Cloudwrkz/
├── apps/
│   ├── web/              # (optional) legacy Next.js during migration; remove when done
│   ├── web-vite/         # Vite+ React SPA (or rename web after cutover)
│   ├── api/              # Rust API (Axum + SQLx)
│   └── ios/              # Existing iOS app (unchanged; point to new API base URL)
├── packages/             # (optional) shared TS types for Web ↔ API contract
│   └── api-types/        # OpenAPI or hand-written request/response types
├── docs/
│   └── MIGRATION-PLAN-WEB-API-DATABASE.md
├── pnpm-workspace.yaml   # add apps/web-vite; optionally packages/api-types
└── docker-compose.yml   # optional: api + postgres (+ web static served by nginx for local)
```

- **pnpm workspace**: Include `apps/web-vite` (and `packages/api-types` if you add it). iOS stays outside pnpm.
- **Rust**: `apps/api` is a Cargo project; no need to be in pnpm.

---

## 7. Deployment and Runtime

### 7.1 Local Development

- **Database**: `docker-compose up postgres` (or existing Compose stack).
- **API**: `cargo run` (or `vp run` if you wrap it) in `apps/api`; env: `DATABASE_URL`, port.
- **Web**: `vp dev` in `apps/web-vite`; env: `VITE_API_URL=http://localhost:<API_PORT>`.
- **iOS**: Point to `http://localhost:<API_PORT>` (or tunnel) for API.

### 7.2 Production

- **Web**: Build with `vp build`; deploy output to **CDN / static host** (S3+CloudFront, Netlify, Vercel static, etc.). No server runtime.
- **API**: Build Rust binary (e.g. `cargo build --release`); run in **containers** (Docker) or on VMs. Put behind **load balancer**; scale by adding replicas.
- **Database**: Managed PostgreSQL (RDS, Cloud SQL, etc.) or self-hosted with backups and optional read replicas.

### 7.3 CORS and Cookies

- **API** must allow CORS for the Web origin (e.g. `https://app.cloudwrkz.com`). If using cookie-based session for web, set `SameSite`, `Secure`, and cookie domain correctly.
- **iOS** uses token in `Authorization` header; no cookie.

---

## 8. Phased Migration Plan

| Phase | Scope | Outcome |
|-------|--------|--------|
| **1. API first** | Implement Rust API with same routes and request/response shapes as current Next.js API. Use existing PostgreSQL and Prisma migrations (or export SQL). Add health/ping. | iOS and a thin test client can switch to Rust API; Next.js still serves web. |
| **2. Web on Vite+** | New Vite+ app; port UI and routing; API client points to Rust API. Dual-run: Next.js and Vite+ both available; switch traffic to Vite+ when ready. | Web UI served from Vite+ build; no Next.js API usage from web. |
| **3. Decommission Next.js API** | Remove API routes and server actions from Next.js; remove Prisma from web. Optionally remove Next.js app entirely and rename `web-vite` to `web`. | Single backend: Rust API only. |
| **4. DB ownership** | If not already done, move migration ownership to Rust (SQL migrations in `apps/api`). Optionally drop Prisma from repo. | One migration path; DB only touched by API. |
| **5. Scale and harden** | Add load balancer, multiple API replicas, CDN for web, DB tuning and optional read replicas. | Horizontal and vertical scalability in place. |

---

## 9. Checklist Summary

- **Web (Vite+)**
  - [x] New Vite+ React app in monorepo
  - [ ] Same UI (layout, pages, components) with React Router
  - [ ] API client with configurable base URL and auth token
  - [ ] All server actions replaced by API calls to Rust API
  - [ ] Auth: token-based (cookie or header) against Rust API
  - [ ] Static build deployable to CDN; horizontally scalable

- **API (Rust)**
  - [ ] Axum (or chosen framework) + SQLx/Diesel
  - [ ] All current API routes ported; same contract for Web and iOS
  - [ ] Auth: session table + token validation; bcrypt/argon2
  - [ ] Stateless; connection pooling; CORS and cookie config
  - [ ] Health/ping endpoints
  - [ ] Deployable as container; horizontally scalable (N instances)

- **Database**
  - [ ] PostgreSQL remains; only API (and optional tooling) connect
  - [ ] Migrations: Prisma or SQL in Rust repo; single source of truth
  - [ ] Pool size and instance count tuned for `max_connections`
  - [ ] Optional read replicas for read scaling

- **Repo and ops**
  - [ ] Monorepo layout: `apps/web-vite`, `apps/api`, `apps/ios`
  - [ ] Docker/Compose for local API + DB (and optional static web)
  - [ ] Production: LB + API replicas + CDN + managed or self-hosted Postgres

This plan keeps the **website UI the same**, rewrites the **website** in **Vite+**, implements the **backend in Rust**, and keeps the **database** as a separate, scalable layer with the API and web service both **horizontally and vertically scalable** as described above.
