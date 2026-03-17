# Performance, Memory & Optimization Plan

This plan documents optimization opportunities and fixes identified across the Cloudwrkz codebase. Items are grouped by area (Performance, Caching, Database, Memory, Code Quality, Security, Config) and include scope, impact, files to touch, and implementation notes. A priority matrix is at the end.

**Current stack (context):** Next.js 16 (App Router), React 18, Prisma, Server Actions + API route handlers, ~170+ client components, TipTap, Recharts, react-hook-form, standalone output.

---

## 1. Performance

### 1.1 Recharts dynamic imports (bundle size)

**Goal:** Reduce client bundle size and chunk fragmentation from Recharts on pages that use charts.

**Problem:** In `HealthMetrics.tsx`, `AgentStatisticsPage.tsx`, and `StatisticsPage.tsx`, each Recharts component (LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart, CartesianGrid, etc.) is dynamically imported in a separate `dynamic(() => import("recharts").then(mod => ({ default: mod.XAxis })), { ssr: false })` call. This creates many small chunks and can hurt tree-shaking and increase request overhead.

**Scope:**
- Consolidate to one or a few dynamic imports per page. Options:
  - **Option A:** A single dynamic import of a wrapper component that imports all needed Recharts components internally (e.g. `const HealthCharts = dynamic(() => import("@/components/features/health/HealthCharts"), { ssr: false })`). The wrapper file does normal named imports from `recharts`; the whole chart section is one chunk.
  - **Option B:** One dynamic import per “chart type” (e.g. one for LineChart + Line + XAxis + YAxis + Tooltip + ResponsiveContainer, one for AreaChart + Area + …, one for BarChart + Bar + …) so pages that only need one chart type don’t pull others.
- Keep `ssr: false` for Recharts (no SSR for charts is fine).

**Files to touch:**
- `src/components/features/health/HealthMetrics.tsx` – replace many `dynamic(…recharts…)` with one or two dynamic wrapper(s).
- `src/components/features/agent/AgentStatistics/AgentStatisticsPage.tsx` – same.
- `src/components/features/admin/Statistics/StatisticsPage.tsx` – same.
- Optional: create shared chart wrapper components under e.g. `src/components/ui/charts/` (e.g. `LineChartWidget.tsx`, `BarChartWidget.tsx`) that encapsulate Recharts and are loaded via a single `dynamic()` per widget.

**Dependencies:** None.

**Notes:** After change, run a production build and compare `.next/static/chunks` size for the affected pages (e.g. dashboard/health, admin/statistics, agent statistics).

---

### 1.2 Lazy-load heavy client features

**Goal:** Defer loading of large client bundles until the user actually needs them (TipTap, admin tools, floating timer).

**Scope:**
- **TipTap (RichTextEditor):** Used in ticket/task description and comment forms. Wrap the editor (or the route that renders it) in `next/dynamic` with `ssr: false` and a loading fallback (e.g. skeleton or “Loading editor…”). So the editor bundle loads only when the user opens a form that contains the rich text editor.
- **Admin-heavy components:** e.g. `AdminDatabaseConsole`, `UserPermissionsManager`, `GroupPermissionsManager`, `ModuleManagementPage`, `SessionManagementPage`. These pages are only visited by admins. Use `next/dynamic` for the page-level client component (or the heaviest subcomponents) with a loading state so the rest of the dashboard stays light.
- **FloatingTimerWidget:** Used on time-tracking and possibly dashboard. Consider `dynamic(…FloatingTimerWidget…, { ssr: false })` in the layout or parent so the timer widget script doesn’t block initial dashboard paint.

**Files to touch:**
- `src/components/ui/RichTextEditor/RichTextEditor.tsx` – either keep as-is and lazy-load a parent that wraps it, or export a lazy version (e.g. `RichTextEditorLazy`) used in forms.
- `src/app/(dashboard)/dashboard/admin/` – page files or layout: wrap admin-only client trees in `dynamic(..., { loading: () => <AdminPageSkeleton /> })`.
- `src/app/(dashboard)/layout.tsx` or `FloatingTimerWidgetProvider` usage: wrap `FloatingTimerWidgetProvider` (or the widget itself) in `dynamic(..., { ssr: false })`.

**Dependencies:** None. Ensure loading fallbacks are accessible (e.g. aria-busy, role, or status text).

**Notes:** Measure LCP / TTI before and after; ensure no layout shift (reserve space for the widget if needed).

---

### 1.3 Reduce client boundary size (more Server Components)

**Goal:** Shrink the amount of JavaScript sent to the client by keeping as much as possible in Server Components and only using `"use client"` where interactivity is required.

**Problem:** The codebase has ~170+ files with `"use client"`. Some of these might be wrappers that could be split: a Server Component parent that fetches data and passes it to a thin client component for interactivity.

**Scope:**
- **Audit:** For key routes (e.g. dashboard, links list, tickets list), identify components that only need client for one thing (e.g. a button, a filter dropdown). Split so the list/layout is a Server Component that receives data from server and renders a small client component for the interactive part.
- **Data fetching:** Prefer loading data in Server Components (or in Server Actions called from server) and passing as props. Replace patterns where a client component does `useEffect` + `fetch` or Server Action just to load initial list data with server-side data fetch and props.
- **Layouts:** Keep dashboard layout server-rendered; only wrap the parts that need state/effects in client components.

**Files to touch:** Spread across many components. Start with high-traffic pages, e.g.:
- `src/app/(dashboard)/dashboard/links/` – page vs `LinksPageClient.tsx`.
- `src/app/(dashboard)/dashboard/tickets/` – page vs `TicketsPageClient.tsx`.
- List components that receive `links`/`tickets`/`todos` from server: ensure the parent page is a Server Component that fetches and passes data; keep only the interactive list UI as client.

**Dependencies:** None. Requires incremental refactor and testing.

**Notes:** Use React DevTools or bundle analyzer to see which components pull in large dependencies; target those first.

---

### 1.4 Image optimization (Next.js Image)

**Goal:** Use Next.js image optimization where possible to reduce payload and improve LCP; avoid `unoptimized` when not required.

**Problem:** Several places use `<Image … unoptimized />` for favicons, avatars, or external URLs (e.g. in `LinkList.tsx`, `SearchResultsTable.tsx`, `SearchPreviewPanel.tsx`, `SearchDialog.tsx`, `LinkEditForm.tsx`, `EditLinkDialog.tsx`, `QrLoginPanel.tsx`, `LinkDetailHeader.tsx`, `LinkMetadataDisplay.tsx`). For user- or external-content URLs this is sometimes necessary (e.g. arbitrary domains). For known domains (e.g. your own API or CDN), optimization can be enabled.

**Scope:**
- Add `images.remotePatterns` (or `images.domains`) in `next.config.js` for any host(s) that serve favicons/avatars you control (e.g. same origin, or a known CDN). See Next.js docs for `remotePatterns` (allowed origins, pathnames, etc.).
- Where the image URL is from your own app (e.g. `/api/profile/avatar/...`, `/api/links/.../favicon`), remove `unoptimized` so Next.js can optimize and serve modern formats/sizes.
- Keep `unoptimized` for truly arbitrary URLs (e.g. user-pasted favicon URLs from the internet) unless you proxy them through your own route and add that route to allowed origins.

**Files to touch:**
- `next.config.js` – add `images: { remotePatterns: [ ... ] }` (or `domains`) as appropriate.
- `src/components/features/links/LinkList/LinkList.tsx` – remove `unoptimized` for images that match allowed origins.
- `src/components/features/search/SearchResultsTable/SearchResultsTable.tsx`, `SearchPreviewPanel.tsx`, `SearchDialog.tsx` – same.
- `src/components/features/links/LinkEditForm/LinkEditForm.tsx`, `EditLinkDialog.tsx`, `LinkDetailHeader.tsx`, `LinkMetadataDisplay.tsx` – same.
- `src/components/features/auth/QrLoginPanel/QrLoginPanel.tsx` – QR code data URL can stay `unoptimized` (data URLs are not optimized by Next Image).

**Dependencies:** None. Ensure no broken images after config change (test with staging).

**Notes:** If favicons are stored as data URLs or blob URLs, optimization may not apply; focus on HTTP(S) URLs you control.

---

## 2. Caching & revalidation

### 2.1 Reduce duplicate and broad revalidatePath usage

**Goal:** Avoid over-invalidation of caches and unnecessary re-renders by revalidating only the paths that actually display the changed data; prefer tag-based invalidation where applicable.

**Problem:** In Server Actions (e.g. tickets, links, todos, time-tracking), a single mutation often calls `revalidatePath` for multiple paths (e.g. `/dashboard/tickets`, `/dashboard`, `/dashboard/time-tracking`). That can cause more work than needed and doesn’t scale well as the app grows.

**Scope:**
- **Revalidate only what’s needed:** For each mutation, list which routes actually show the mutated data. Call `revalidatePath` only for those (e.g. after creating a ticket, revalidate `/dashboard/tickets` and the ticket detail route if it’s cached; avoid revalidating `/dashboard` or `/dashboard/time-tracking` unless that page also shows ticket data).
- **Prefer revalidateTag where it fits:** For data that is shared across many paths (e.g. “tickets list”, “current user’s links”), consider using `unstable_cache` with tags and then `revalidateTag("tickets")` (or similar) so one tag invalidates all consumers. Then you don’t need to enumerate every path.
- **Document convention:** In a short ADR or comment in a shared module, document when to use `revalidatePath` vs `revalidateTag` and the tag naming scheme.

**Files to touch:**
- `src/server/actions/tickets.ts` – reduce revalidatePath calls to the minimal set per action; consider tags for ticket list/detail.
- `src/server/actions/links.ts` – same for links and collections.
- `src/server/actions/todos.ts` – same for todos and related ticket pages.
- `src/server/actions/time-tracking.ts` – same for time-tracking and ticket pages.
- `src/server/actions/sessions.ts`, `auth.ts`, `notifications.ts`, `preferences.ts`, `users.ts`, `logout.ts`, `collections.ts`, and admin actions – audit and trim.
- Optional: add a small helper or constants for path/tag names to avoid typos and make refactors easier.

**Dependencies:** None. Ensure no stale UI (e.g. list not updating after create) after reducing revalidation.

**Notes:** If a layout fetches data that depends on the mutated resource, that layout’s path (or its tag) must still be revalidated. Test each mutation flow after changes.

---

### 2.2 Strategic use of revalidate and unstable_cache for stable data

**Goal:** Avoid forcing full dynamic rendering for data that changes infrequently (e.g. module list, permission list); use short revalidate or tagged cache so the server isn’t recomputing on every request.

**Problem:** Dashboard and other pages use `export const revalidate = 0` (force dynamic). That’s correct for user-specific, real-time data. Some data (e.g. list of enabled modules, permission definitions) is relatively stable and could be cached for a short period.

**Scope:**
- Identify reads that are stable or shared across users (e.g. `getAllModules()`, permission keys). Wrap them in `unstable_cache(..., { revalidate: 60, tags: ["modules"] })` (or similar) so they’re cached for 60s or until `revalidateTag("modules")` is called when an admin changes modules.
- Keep `revalidate = 0` (or dynamic) for pages that must always reflect the latest user-specific data (e.g. tickets list, time entries). Don’t cache user-specific mutations or lists unless product explicitly allows staleness.

**Files to touch:**
- `src/server/actions/modules.ts` – consider caching `getAllModules()` and/or `isModuleEnabled()` with a short revalidate and tag; call `revalidateTag` when modules are updated in admin.
- Layout that fetches modules/permissions: ensure it uses the cached version where appropriate.
- Optional: `src/server/actions/permissions.ts` or permission helpers – cache permission definitions (not per-user permission results) if they change rarely.

**Dependencies:** None. Clear documentation of which data is cached and for how long.

**Notes:** Don’t cache per-user authorization results (e.g. “can this user see tickets”) with long TTLs; only cache reference data.

---

## 3. Database & Prisma

### 3.1 N+1 and select/include discipline

**Goal:** Ensure list and detail endpoints use a single query with a minimal, explicit `select` (and one level of `include` only when needed) so the server doesn’t over-fetch or run N+1 queries.

**Scope:**
- For every `findMany` used for list views (tickets, links, todos, time entries), audit the `select`/`include`. Only include fields that the list UI actually needs (e.g. id, title, status, createdAt, assignee name). Avoid loading full nested relations (e.g. all comments, all activities) for list rows.
- If a list needs a count or a single relation field (e.g. “assignee name”), use one query with a focused `include: { assignedTo: { select: { name: true } } }` (or similar) rather than loading full user objects or doing follow-up queries per row.
- For detail views, use one query that includes only the relations needed for that view; avoid separate queries that could be combined.

**Files to touch:**
- `src/server/actions/tickets.ts` – `getTickets` and any list-building logic.
- `src/server/actions/links.ts` – link list and collection list queries.
- `src/server/actions/todos.ts` – todo list and subtask queries.
- `src/app/api/links/get-links-handler.ts` – same link select pattern.
- API handlers that use Prisma for lists: align with the same select/include rules.

**Dependencies:** None. Verify list and detail pages still show correct data and that no new N+1 appears in logs (e.g. Prisma debug or APM).

**Notes:** Prisma’s `select` is your friend; defaulting to `include` without `select` often pulls more than needed.

---

### 3.2 Composite indexes for frequent filter/sort combinations

**Goal:** Avoid full table scans and slow sort on large tables by adding composite indexes that match the actual filter and order-by used in list/search queries.

**Scope:**
- Review the most common list queries: e.g. “my links, not archived, ordered by createdAt desc”, “tickets by status and assignee”, “time entries by user and date range”. Check the Prisma schema and add `@@index([userId, archivedAt, createdAt])` (or the appropriate combination) for the main query patterns.
- Search and full-text: if you use raw SQL or Prisma full-text, ensure the underlying tables have the recommended indexes (e.g. GIN for tsvector if using Postgres full-text).

**Files to touch:**
- `prisma/schema.prisma` – add `@@index([...])` on Link, Ticket, Todo, TimeEntry, etc., for the exact column combinations used in `where` and `orderBy` in list handlers.
- Run `prisma migrate dev` (or equivalent) to generate and apply the migration.

**Dependencies:** None. Monitor query performance before/after; avoid adding redundant indexes that slow down writes.

**Notes:** Prisma’s existing indexes (e.g. on userId, status, archivedAt) are good; the plan is to add composite indexes where a single-column index isn’t enough for the common filters.

---

## 4. Memory & runtime

### 4.1 jsdom and server bundle

**Goal:** Ensure `jsdom` is not loaded on the server for every request if it’s only needed in tests or in a narrow server path (e.g. one route). That reduces memory and cold starts.

**Problem:** `next.config.js` has `serverExternalPackages: ['jsdom']`. If jsdom is only used in tests (e.g. `CookiesDisclaimer.test.tsx` mentions jest-environment-jsdom/vitest jsdom), it shouldn’t be in the production server bundle. If it’s used in server code (e.g. HTML sanitization or scraping), that can be heavy in serverless.

**Scope:**
- **Confirm usage:** Grep for `jsdom`/`JSDOM` in `src/` (excluding tests). If only in tests, remove `jsdom` from `serverExternalPackages` and ensure tests use their own test-environment jsdom.
- **If used in server:** Prefer lighter alternatives (e.g. `isomorphic-dompurify` without full jsdom, or a small HTML parser) for sanitization. If you must use jsdom, isolate it to a single route or a worker so it’s not loaded for every request.
- **Package.json:** If jsdom is only a devDependency for tests, keep it there; the production build won’t include it unless something in `src` imports it.

**Files to touch:**
- `next.config.js` – remove `serverExternalPackages: ['jsdom']` if jsdom is not imported in server code.
- Any server file that imports jsdom: refactor to avoid it or isolate to a dedicated module/route.
- Tests: ensure they still run (jest/vitest config may need `testEnvironment: 'jsdom'` or equivalent).

**Dependencies:** None. Verify production build and tests after change.

**Notes:** The codebase uses `isomorphic-dompurify` for HTML sanitization; confirm whether that pulls in jsdom on the server or runs in a lighter mode.

---

### 4.2 Console usage in production

**Goal:** Avoid noisy and unnecessary `console.log`/`console.error` in production; use a small logger that can be disabled or forwarded to your logging system.

**Problem:** There are many `console.log`/`console.error` calls in server actions, API routes, and some components. In production this clutters logs and has a small performance cost.

**Scope:**
- Introduce a small logger (e.g. `src/lib/utils/logger.ts` – you may already have one; the codebase references `sanitizeContext` there). Ensure it:
  - In production (or when `NODE_ENV === 'production'`): either no-ops for debug level, or forwards only to your logging pipeline (e.g. structured JSON to stdout).
  - In development: can still log to console with levels (info, warn, error, debug).
- Replace `console.log`/`console.error` in server code (actions, API routes, server utils) with the logger. In components, prefer the logger for non-debug messages or remove logs that were only for development.
- Optionally add an ESLint rule to disallow `console.*` in server code (or in production paths) and allow only the logger.

**Files to touch:**
- `src/lib/utils/logger.ts` – extend or add env-based behavior (no-op or structured output in prod).
- `src/server/actions/*.ts` – replace console with logger (many files).
- `src/app/api/**/*.ts` – same.
- Optional: `eslint.config.mjs` (or equivalent) – rule to flag `console` in `src/server` and `src/app/api`.

**Dependencies:** None. Ensure errors are still visible in production (e.g. logger.error in a catch block).

**Notes:** Don’t remove error logging; centralize it so that critical errors are still reported and sensitive data is not logged (you already have `sanitizeContext` for that).

---

## 5. Code quality & consistency

### 5.1 Duplicate API surface (/api vs /api/auth)

**Goal:** Keep the dual API surface (cookie-based and bearer-based under `/api/auth/...` for iOS) consistent and maintainable: same handler, same behavior, no duplicated logic or missing auth on one path.

**Scope:**
- Ensure every `/api/auth/...` route that mirrors `/api/...` simply delegates to the same handler (e.g. `getLinksApiHandler`, `getTicketsApiHandler`). No copy-paste of logic.
- Document in code or in this doc that `/api/auth/*` is for clients that send bearer tokens (e.g. iOS app); `/api/*` may use cookie auth. Both must enforce auth and permissions the same way.
- Audit: confirm that no route under `/api/` or `/api/auth/` skips auth or permission checks that its counterpart has.

**Files to touch:**
- All route files under `src/app/api/auth/` that delegate to handlers in `src/app/api/` – verify they only call the handler and don’t duplicate logic.
- Optional: add a one-line comment in each auth route file: “Same as GET /api/...; exists for iOS bearer auth.”

**Dependencies:** None.

**Notes:** Current pattern (e.g. `auth/links/route.ts` calling `getLinksApiHandler`) is good; the plan is to verify and document, not to remove the dual surface.

---

### 5.2 Error handling and correlation in API routes

**Goal:** In API route handlers, log errors consistently and optionally return a non-sensitive correlation id so support can trace issues without exposing internals.

**Scope:**
- In catch blocks of API route handlers, use the shared logger (see 4.2) to log the error (and optionally request id or correlation id). Do not send stack traces or internal details in the JSON response.
- Optionally add a request-scoped id (e.g. `x-request-id` or generated) and include it in the log and in the response body for 500 errors (e.g. `{ message: "Internal server error", requestId: "..." }`). This helps support ask users to provide the id for lookup.

**Files to touch:**
- `src/app/api/**/*.ts` – standardize catch blocks: log with logger, return generic message + optional requestId.
- Middleware or a small helper that generates/reads request id and attaches to response or logger context.

**Dependencies:** Logger (4.2). Optional: middleware for request id.

**Notes:** Keep 4xx responses without request id if you prefer; use request id mainly for 5xx.

---

## 6. Security & robustness

### 6.1 Raw SQL and parameterization in search

**Goal:** Ensure all raw SQL used for search (e.g. full-text) is parameterized so that user input cannot change the query structure; avoid relying solely on string escaping.

**Scope:**
- In `src/server/actions/search.ts`, search uses `sanitizedSearchTerm` (single-quote escaped) and string interpolation in raw queries (e.g. `plainto_tsquery('english', ${sanitizedSearchTerm})`). Prefer Prisma’s `Prisma.sql` with parameters (e.g. `Prisma.sql` template tag and passed parameters) so the term is always bound as a value, not concatenated. If Prisma raw doesn’t support a certain full-text function, ensure the only user-controlled part is passed as a bound parameter.
- Review any other raw SQL in the app (e.g. admin DB console) for parameterization; the admin console already has identifier sanitization, but any user-supplied values in WHERE or similar must be parameterized.

**Files to touch:**
- `src/server/actions/search.ts` – refactor raw full-text queries to use `Prisma.sql` with parameterized search term.
- Any other file using `prisma.$queryRaw` or `$queryRawUnsafe` with user input – same.

**Dependencies:** None. Test search with special characters and attempted injection.

**Notes:** Escaping quotes is a defense-in-depth measure; parameterization is the primary safeguard.

---

### 6.2 HTML sanitization consistency

**Goal:** All user-supplied HTML (tickets, todos, comments) must be sanitized with the same DOMPurify config before store and before render.

**Scope:**
- Confirm that every code path that saves `descriptionHtml` or `contentHtml` (tickets, todos, comments) uses `sanitizeHtml` from `@/lib/utils/rich-text` (or `html-sanitizer`) before persisting. No raw HTML from the client should be stored.
- Confirm that every code path that renders rich text (e.g. `RichTextDisplay`) uses the same sanitizer on render (or only ever renders already-stored sanitized HTML). The codebase already uses `sanitizeHtml` in `RichTextDisplay` and in server actions; document this as the single contract and audit any bypass (e.g. direct `dangerouslySetInnerHTML` with unsanitized content).
- Keep `dangerouslySetInnerHTML` only for content that has been sanitized (e.g. `__html: sanitizedContent`).

**Files to touch:**
- Audit: `src/server/actions/tickets.ts`, `todos.ts`, and any comment/activity handlers – ensure all HTML from client is sanitized before save.
- Audit: all components that render ticket/todo/comment HTML – ensure they use `RichTextDisplay` or an equivalent that sanitizes.
- `src/lib/utils/html-sanitizer.ts` – document allowed tags/attrs and that this is the single source of truth for rich text.

**Dependencies:** None.

**Notes:** No change to DOMPurify config unless you explicitly want to allow/deny more tags; the plan is consistency and audit.

---

## 7. Next.js configuration

### 7.1 images.remotePatterns

**Goal:** Configure allowed image origins so Next.js Image can optimize external images where appropriate and so you can remove `unoptimized` for your own domains.

**Scope:**
- In `next.config.js`, add `images: { remotePatterns: [ ... ] }` (or `domains`) per Next.js docs. Include:
  - Your own origin (e.g. `https://your-app.com`, `https://api.your-app.com`) for avatar, favicon, or uploaded image URLs.
  - Any CDN you use for user uploads.
- Do not add wildcard “all domains”; only add trusted origins. For arbitrary user URLs (e.g. link favicons from the open web), keep `unoptimized` or proxy through your own endpoint and add that endpoint’s origin.

**Files to touch:**
- `next.config.js` – add `images.remotePatterns` (or `domains`) and document in a comment which use case each entry is for.

**Dependencies:** None. Align with image optimization work (1.4).

---

### 7.2 experimental.optimizePackageImports (optional)

**Goal:** Reduce client bundle size by optimizing imports from large packages (e.g. a UI library or Recharts) so only used exports are bundled.

**Scope:**
- If you add or use a large package that supports barrel-file tree-shaking (e.g. `lucide-react`, or a component library), add that package to `experimental.optimizePackageImports` in `next.config.js`. See Next.js docs for the exact array format.
- Recharts and TipTap may or may not benefit; try and measure. If the main gain is from dynamic imports (1.1, 1.2), this can be lower priority.

**Files to touch:**
- `next.config.js` – add `experimental: { optimizePackageImports: ['package-name'] }` and re-run build to compare bundle size.

**Dependencies:** None. Optional.

---

## 8. Priority matrix and suggested order

| Priority | Item | Area | Impact | Effort (rough) |
|----------|------|------|--------|------------------|
| High     | 1.1 Recharts dynamic imports | Performance | Bundle size, request count | Medium |
| High     | 1.2 Lazy-load TipTap & admin | Performance | TTI, LCP | Medium |
| High     | 4.2 Logger and reduce console in prod | Memory / Ops | Log noise, small perf | Medium |
| High     | 6.1 Parameterize search SQL | Security | Security | Low |
| Medium   | 2.1 Reduce revalidatePath scope | Caching | Server load, clarity | Medium |
| Medium   | 4.1 jsdom and server bundle | Memory | Memory, cold start | Low–Medium |
| Medium   | 3.1 N+1 and select discipline | Database | Latency, DB load | Medium |
| Medium   | 1.4 Image optimization | Performance | LCP, payload | Low |
| Medium   | 6.2 Sanitization audit | Security | Consistency | Low |
| Low      | 1.3 Shrink client boundaries | Performance | Bundle size | High |
| Low      | 2.2 unstable_cache for stable data | Caching | Server load | Low |
| Low      | 3.2 Composite indexes | Database | Query time | Low |
| Low      | 5.1 API surface consistency | Code quality | Maintainability | Low |
| Low      | 5.2 Error handling / request id | Ops | Debuggability | Low |
| Low      | 7.1 images.remotePatterns | Config | Enables 1.4 | Low |
| Optional | 7.2 optimizePackageImports | Config | Bundle size | Low |

**Suggested implementation order (first sprint):**
1. 6.1 – Parameterize search SQL (security, low effort).
2. 4.2 – Logger and replace console in server/API (clear production logs).
3. 1.1 – Recharts consolidation (visible bundle win).
4. 2.1 – Trim revalidatePath and introduce tags where useful.
5. 4.1 – Resolve jsdom in server bundle (if confirmed only used in tests).

**Second pass:** 1.2 (lazy load), 3.1 (N+1/select), 1.4 + 7.1 (images), 6.2 (sanitization audit). Then 1.3, 2.2, 3.2, 5.1, 5.2, 7.2 as capacity allows.

---

## 9. Verification and metrics

- **Bundle size:** Run `pnpm build` and inspect `.next/static/chunks` (or use `@next/bundle-analyzer`). Compare before/after for dashboard, admin, and health/statistics pages.
- **Runtime memory:** If possible, measure Node RSS for a few representative requests (e.g. dashboard load, search, ticket create) before and after jsdom/logging changes.
- **LCP / TTI:** Use Lighthouse or WebPageTest for dashboard and one heavy page (e.g. links list) before and after lazy-loading and image changes.
- **DB:** Use Prisma query logging or APM to confirm no N+1 and that new indexes are used for list queries.
- **Security:** Run a quick manual test (and optionally a simple automated check) for search with `'` and `;` and SQL-like strings; confirm no injection. Re-check that all rich text render paths use sanitized HTML only.

---

*Document version: 1.0. Last updated: 2025-03-12.*
