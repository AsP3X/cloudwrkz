# Backend–Website Separation & Scaling Plan

This plan describes how to separate the Cloudwrkz monolith into a **scalable backend (API)**, a **website** that consumes it, a **database** layer, and **iOS/Android apps**, and how this fits with a possible **framework switch** for the web frontend.

**Current state:** Single Next.js app: SSR, Server Actions, API routes, Prisma, session (cookies) for web and bearer tokens for iOS. One deployment does everything.

**Target state:** Website | API (Backend) | Database | iOS App | Android App — each independently deployable and scalable.

**Horizontal scaling:** To run multiple API instances behind a load balancer, the API must be stateless and use shared stores (DB, Redis, object storage). See **[API Horizontal Scaling Plan](./api-horizontal-scaling-plan.md)** for how to achieve that (sessions, file storage, rate limiting, SSE/real-time, DB pooling).

---

## 1. Target architecture (high level)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     CLIENTS                              │
                    └─────────────────────────────────────────────────────────┘
                       │              │              │              │
                       ▼              ▼              ▼              ▼
              ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
              │   Website    │ │   iOS App    │ │ Android App  │ │  (future:     │
              │  (browser)   │ │              │ │              │ │   CLI, etc.)  │
              └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                     │                │                │                │
                     │  HTTPS         │  HTTPS         │  HTTPS        │
                     │  Cookie or     │  Bearer token  │  Bearer token │
                     │  Bearer        │                │                │
                     ▼                ▼                ▼                ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │                    API (Backend)                         │
                    │  • REST (or GraphQL)                                     │
                    │  • Auth: session (cookie) + bearer (mobile)               │
                    │  • Business logic, validation, permissions             │
                    │  • Single writer to DB                                   │
                    └─────────────────────────────────────────────────────────┘
                                         │
                                         │  Prisma / SQL
                                         ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │                  Database (PostgreSQL)                    │
                    │  • Single primary (writes)                               │
                    │  • Optional read replicas for scale                    │
                    └─────────────────────────────────────────────────────────┘
```

- **Website:** Renders UI for browsers. Can be SSR (Next.js, Remix) or SPA (Vite + React). Calls API for all data and mutations (or uses a thin BFF that proxies to API).
- **API (Backend):** Stateless service. Handles auth, business logic, validation, permissions. Only component that talks to the database. Scales horizontally.
- **Database:** PostgreSQL (current). Scale via connection pooling (e.g. PgBouncer), read replicas if needed; single primary for writes.
- **iOS / Android:** Call the same API with bearer tokens (already partially in place via `/api/auth/*`).

---

## 2. Why separate backend and website?

| Goal | How separation helps |
|------|------------------------|
| **Scale API independently** | More traffic or mobile users → scale API instances only; website can stay smaller or use CDN. |
| **Scale website independently** | Marketing/SEO traffic spikes → scale web servers; API load stays tied to authenticated usage. |
| **Clear boundaries** | One place for business logic and DB access (API); fewer bugs and easier to secure. |
| **Multiple clients** | iOS, Android, future CLI or partners use the same API contract; no duplication of logic. |
| **Tech flexibility** | Website can switch framework (e.g. Next → Remix) or even stack without rewriting business logic. API can later be rewritten in another language if needed. |
| **Deployment** | Deploy API and website on different schedules; run different runtimes/regions (e.g. API in one region, CDN for website). |

---

## 3. API design (backend service)

### 3.1 Responsibilities of the API

- **Auth:** Session validation (cookie) for web; token validation (bearer) for mobile; login, logout, refresh, QR login, password reset.
- **Business logic:** Everything that today lives in Server Actions and API route handlers (tickets, todos, links, collections, time tracking, notifications, admin, search, etc.).
- **Data access:** All Prisma (or future ORM) usage; only the API talks to the database.
- **Validation:** Request body/query validation (e.g. Zod) and permission checks (e.g. `hasPermission`, module access).
- **Audit & logging:** Centralized logging and audit events; no business logic in the website.

### 3.2 API style: REST vs GraphQL

- **REST (recommended for this codebase):** You already have a REST-like surface (`/api/tickets`, `/api/links`, etc.). Easy to migrate: move route handlers into the new backend and keep URLs similar. Good for mobile (caching, simple clients). Use **OpenAPI/Swagger** for contract and codegen for iOS/Android.
- **GraphQL:** Single endpoint, flexible queries; better if many clients need very different shapes. Higher complexity (schema, resolvers, N+1). Can be a later addition (e.g. GraphQL gateway in front of same services) if needed.

**Recommendation:** Start with **REST**. Keep resource-oriented URLs (e.g. `GET /tickets`, `POST /tickets`, `GET /tickets/:id`, `PATCH /tickets/:id`). Use a consistent JSON shape and error format (e.g. `{ data?, error?, message? }`).

### 3.3 Auth for web vs mobile

- **Website:**  
  - **Option A (session cookie):** Browser sends cookie; API validates session server-side (same as today). API must run on a domain/cookie scope that matches the website (e.g. same site or carefully configured CORS + credentials).  
  - **Option B (token in frontend):** Website gets a token after login (e.g. from API `POST /auth/login`), stores it (e.g. httpOnly cookie set by API, or memory/localStorage with care), and sends `Authorization: Bearer <token>` to the API. Same as mobile.
- **iOS / Android:** Already bearer token. Keep `Authorization: Bearer <token>`; token issued by API (e.g. after `POST /auth/login` with credentials or QR flow).

**Recommendation:** Prefer **Option B** for a clean split: one auth model (bearer) for all clients. Website can still use SSR and call API from the server (BFF or Next/Remix server) with a server-held token or session cookie that the BFF exchanges for API calls. Alternatively keep cookie-based sessions for the website only and have the API support both cookie and bearer (more complexity but minimal change for web).

### 3.4 API versioning

- Use a prefix: e.g. `/v1/tickets`, `/v1/links`. Protects mobile apps when you change the contract; website can move to v2 when ready.
- Start with `v1` from day one in the new backend.

---

## 4. Where the API can live (technology choices)

### 4.1 Option A: Dedicated Node.js API (recommended)

- **Stack:** Node.js + **Fastify** (or Express, Koa) + Prisma + Zod. TypeScript.
- **Pros:** Same language as today; Prisma and Zod can be moved over; team skills transfer; fast to extract. Fastify is lightweight and scales well.
- **Cons:** None major for your scale.

**Repository layout:** Either **monorepo** (e.g. `apps/api`, `apps/website`, `packages/shared`) or **separate repo** for API. Monorepo simplifies shared types and validation.

### 4.2 Option B: NestJS

- **Stack:** Node.js + NestJS + Prisma.
- **Pros:** Structure (modules, DI), built-in validation, OpenAPI, guards for auth.
- **Cons:** More boilerplate and learning curve; may be overkill if team is small.

### 4.3 Option C: Keep Next.js as “API only” (interim)

- **Stack:** A Next.js app that only exposes API routes (no pages or minimal BFF pages). Deploy this as “the API.”
- **Pros:** Reuse existing route handlers; minimal move (copy `src/app/api/**` and server actions into this app).
- **Cons:** Next.js is not ideal as a long-term API server (memory, request model). Good as a **first step** to extract API out of the main app; later replace with Fastify/NestJS if needed.

**Recommendation:** Use **Option C as phase 1** (extract API into a separate Next.js API service) so you get separation and scaling quickly. Then **Option A (Fastify)** as phase 2 for a lean, scalable API, reusing Prisma and Zod from the monorepo.

---

## 5. Website after separation (and framework switch)

Once the API is the single backend:

- The **website** only does: UI, routing, forms, SSR (if desired), and **calling the API** for data and mutations. It does **not** use Prisma or direct DB access.
- **Server Actions** in the current sense (that touch the DB) go away on the website; they become either:
  - **API calls** from the client (fetch to the API), or
  - **API calls from the server** (e.g. in Next.js server components or loaders that call the API and pass data to the UI).

### 5.1 Framework choice for the website

| Option | Pros | Cons |
|--------|------|------|
| **Next.js (keep)** | Familiar; SSR, RSC, good ecosystem. | Heavier runtime; you already considered Remix for performance. |
| **Remix** | Lighter memory, server-first, loaders/actions call API easily. | Different mental model (no RSC); migration effort. |
| **Vite + React (SPA)** | Simple, fast dev; API-only backend fits well. | No SSR (SEO for landing/marketing may need a small SSR layer or pre-render). |

**Recommendation:**

- If you want **less memory and simpler server model** for the website: **Remix** is a good fit. Remix loaders/actions become thin: “call API, return data” or “call API for mutation, redirect.” No Prisma in the web app.
- If you prefer **minimal change** and **strong SSR/SEO**: **Keep Next.js** for the website and strip it down to a “frontend + BFF”: no Prisma, no Server Actions that touch DB; only Server Components and API route handlers that **proxy to your new API** (or call it from server-side code). Later you can still switch the website to Remix once the API is stable.

**Framework switch and backend separation are independent:** You can separate the backend first (extract API), then switch the website from Next.js to Remix (or keep Next.js). The API contract (REST + auth) stays the same.

---

## 6. Database scaling (brief)

- **Single primary:** All writes go to one PostgreSQL instance. Connection pooling (e.g. PgBouncer, or Prisma’s pooling) in front of the API to handle many API instances.
- **Read replicas (optional):** For heavy read workloads (e.g. search, dashboards), add read replicas and route read-only Prisma queries to a replica. Writes stay on primary.
- **API is single writer:** Only the API service connects to the DB; website and apps never touch the DB. This keeps scaling and backups simple.

---

## 7. Phased migration approach

### Phase 1: Extract API into a separate service (no framework change yet)

**Goal:** Run the current API surface as a **standalone deployable** that the website and iOS can call. Database stays as-is; only “who calls it” changes.

**Steps:**

1. **Create a new service “api”** (in monorepo or new repo):
   - Copy (or move) from current app:
     - All route handlers under `src/app/api/**` and shared handlers (e.g. `get-links-handler.ts`).
     - Prisma schema and client, and all server-side logic (today in `src/server/actions/**`) that these routes use.
   - Expose the same HTTP surface: e.g. `GET /api/tickets`, `POST /api/auth/login`, etc. Use the same request/response shapes so iOS and the current website keep working.
   - Implement as either:
     - **Next.js API-only app** (e.g. `apps/api` with only `app/api/...` routes and no pages), or
     - **Fastify app** (e.g. `apps/api` with Fastify routes that call the same Prisma + auth logic).

2. **Auth in the new API:**
   - **Bearer:** Keep current token validation (e.g. `getCurrentUserFromBearerToken`). Issue tokens via `POST /auth/login` (and QR flow) from the API.
   - **Cookie (website):** Either move to bearer for web (website stores token and sends it) or have the API accept the same session cookie (cookie domain must allow API host; often easier to move web to bearer).

3. **Point iOS app to the new API:**
   - Change iOS base URL to the new API (e.g. `https://api.cloudwrkz.example.com`). No more calls to the website origin for API.

4. **Website: BFF or direct API calls:**
   - **Option A (BFF):** Keep the existing Next.js app as “website + BFF.” Remove Prisma and direct DB from Next.js. Replace Server Actions and API route bodies with **HTTP calls from Next.js server to the new API** (using fetch). Next.js API routes or Server Actions become thin wrappers: “call API, return result.” Session: either cookie validated by API (if API accepts cookie) or Next.js stores token server-side and adds `Authorization` when calling API.
   - **Option B (direct):** Website frontend (client) calls the new API directly with bearer token. No BFF; simpler but token must be in the frontend (use httpOnly cookie set by API after login, or secure storage). SSR then needs either “fetch on server with server-held token” or “render shell and load data on client.”

**Deliverables after Phase 1:**

- API service deployable and running (e.g. `api.cloudwrkz.example.com`).
- iOS app uses only the API.
- Website uses only the API (via BFF or direct); no Prisma in the website codebase.
- Single database; only the API connects to it.

### Phase 2: Harden and scale the API (optional framework change for API)

**Goal:** Make the API the single source of truth, document contract, and optionally replace Next.js API with Fastify.

**Steps:**

1. **OpenAPI:** Document all endpoints (OpenAPI 3). Use for codegen (iOS/Android clients) and for contract tests.
2. **Replace Next.js API with Fastify** (if you started with Next.js API in phase 1): Move routes and logic into Fastify; same Prisma, same auth. Retire the Next.js API app.
3. **Versioning:** Introduce `/v1/` prefix; keep backward compatibility for existing clients during migration.

### Phase 3: Website framework switch (optional)

**Goal:** If desired, switch the website from Next.js to Remix (or another framework) for performance/DX.

**Steps:**

1. **API contract is fixed:** Website only consumes REST API; no Prisma or Server Actions in the web app.
2. **New Remix app (or other):** Create a new app (e.g. `apps/website-remix`). Implement pages and loaders/actions that call the API (fetch from server). Reuse UI components (React) where possible; adapt routing and data loading to Remix.
3. **Cutover:** Point domain to new website; deprecate old Next.js website.

**Order:** Phase 1 is the enabler. Phase 2 and 3 can be done in parallel (harden API + start Remix spike) or one after the other.

---

## 8. Monorepo layout (suggested)

```
cloudwrkz/
  apps/
    api/                    # Backend service (Fastify or Next.js API-only)
      src/
        routes/
        services/
        prisma/
    website/                 # Current Next.js app (later Remix or keep Next)
      src/
        app/
        components/
  packages/
    shared-types/           # Shared TypeScript types (API request/response, entities)
    validation/             # Zod schemas shared by API and optionally website
    auth/                   # Auth helpers (token validation, session) used by API
  prisma/                   # Single schema; used by apps/api (and CLI if needed)
    schema.prisma
  docs/
  ...
```

- **API** depends on `packages/shared-types`, `packages/validation`, `packages/auth`, and `prisma`.
- **Website** depends on `packages/shared-types` (and optionally `packages/validation` for client-side validation). No Prisma.
- **iOS/Android:** Consume API; can use generated clients from OpenAPI (separate repo or in `packages/api-client`).

---

## 9. Scaling the API horizontally

To run **multiple API instances** behind a load balancer (horizontal scaling), the API must be **stateless** and use shared, external state only:

- **Sessions:** Keep in DB (already the case); any instance can validate.
- **Files:** Store uploads in **object storage** (S3 or compatible), not local disk, so all instances see the same files.
- **Rate limiting:** Use **Redis** (or DB) for counters so limits are global across instances.
- **Real-time (SSE):** Use **Redis pub/sub** so the instance that handles a mutation publishes an event and every instance can push to its connected SSE clients.

See **[API Horizontal Scaling Plan](./api-horizontal-scaling-plan.md)** for detailed steps (file storage migration, Redis for rate limits and SSE, DB connection pooling, health checks, and a pre-scale checklist).

---

## 10. Deployment and environment

- **API:** Deploy as its own service (e.g. Docker, Kubernetes, or serverless like Lambda + HTTP API). Env: `DATABASE_URL`, `JWT_SECRET` (or session secret), `CORS_ORIGINS` (website and mobile origins). Scale horizontally (multiple instances behind a load balancer).
- **Website:** Deploy as today (e.g. Vercel, or same Docker/K8s). Env: `NEXT_PUBLIC_API_URL` (or `API_URL` for server-side calls). No `DATABASE_URL`.
- **Database:** Managed PostgreSQL (e.g. RDS, Cloud SQL, Neon). Connection pooling for the API. Backups and failover as per provider.
- **iOS/Android:** Point `API_BASE_URL` to the API service; no direct DB or website dependency for data.

---

## 11. Summary: how to approach it

1. **Decide API tech:** Start with **Next.js API-only** for a fast extract, or **Fastify** from the start if you prefer a dedicated API stack.
2. **Extract API first:** New deployable with current route handlers + Prisma + auth. Same URLs and shapes.
3. **Move clients to the API:** iOS → API only. Website → call API only (BFF or direct), remove Prisma and DB from website.
4. **Then (optional):** Harden API (OpenAPI, Fastify if you started with Next), then optionally switch website to Remix (or keep Next.js).

**Regarding framework switch:** Separating the backend does not force a website framework change. You can keep Next.js for the website and only strip it of Prisma and direct DB. If you do switch the website to Remix (or another framework), doing it **after** the API is extracted is the cleanest: the website becomes a pure consumer of the API, and the framework only affects how you render and load data on the web.

---

*Document version: 1.0. Last updated: 2025-03-12.*
