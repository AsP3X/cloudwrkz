# Changelog

All notable changes to the Cloudwrkz monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] – 2025-03-17

### Added

#### Feature branch: `feature/web-vite`

- **New Vite + React SPA** (`apps/web-vite/`) — parallel implementation of the current Next.js web app, as per the migration plan (Web (Vite+) checklist). The existing Next.js app is unchanged; both apps coexist in the monorepo.

**Project setup**

- `apps/web-vite/package.json` — Vite 6, React 18, TypeScript, Tailwind CSS, React Router 7, react-hook-form, zod, clsx, tailwind-merge, recharts, fuse.js.
- `apps/web-vite/vite.config.ts` — React plugin, `@/` path alias, dev server on port 5173, proxy `/api` → `http://localhost:3000`.
- `apps/web-vite/tsconfig.json` and `tsconfig.node.json` — strict TypeScript config aligned with existing app.
- `apps/web-vite/tailwind.config.ts` — same theme as Next.js app (primary, secondary, neutral, success, error, warning colors; font families; border radius; box shadows; animations and keyframes).
- `apps/web-vite/postcss.config.js` — Tailwind + Autoprefixer.
- `apps/web-vite/index.html` — root HTML, Inter font, inline theme script to prevent flash.
- `apps/web-vite/.env.example` — `VITE_API_URL`, `VITE_APP_NAME`.

**API and auth**

- `apps/web-vite/src/api/client.ts` — central API client with configurable base URL (`VITE_API_URL`), Bearer token auth, 401 handling and `auth:unauthorized` event, `get`/`post`/`put`/`patch`/`delete`/`upload` helpers.
- `apps/web-vite/src/components/providers/AuthProvider.tsx` — auth context: user state, loading, `login`/`register`/`logout`/`refreshUser`, token in localStorage, redirect on 401.
- `apps/web-vite/src/components/providers/ThemeProvider.tsx` — theme context (light/dark/system) with localStorage and system preference listener.
- `apps/web-vite/src/components/providers/ErrorBoundary.tsx` — React error boundary with reload option.
- `apps/web-vite/src/components/providers/index.ts` — re-exports for providers.

**Layout**

- `apps/web-vite/src/components/layout/SidebarContext.tsx` — sidebar open/close state for mobile.
- `apps/web-vite/src/components/layout/Header.tsx` — public header: logo, nav (Features, About, Contact), Sign In / Get Started, mobile menu.
- `apps/web-vite/src/components/layout/Footer.tsx` — footer with link sections and copyright.
- `apps/web-vite/src/components/layout/DashboardSidebar.tsx` — dashboard nav (Dashboard, Work, Time tracking, Personal), module filtering, nav counts, mobile overlay.
- `apps/web-vite/src/components/layout/DashboardHeader.tsx` — sticky header with user menu (Profile, Settings, Sign out).
- `apps/web-vite/src/components/layout/DashboardLayout.tsx` — layout wrapper with SidebarProvider, auth check, redirect to login, Outlet for child routes.
- `apps/web-vite/src/components/layout/index.ts` — layout exports.

**UI components**

- `apps/web-vite/src/components/ui/Button.tsx` — variants (primary, secondary, outline, ghost, danger), sizes (sm, md, lg), loading state, `asChild` + href → React Router `Link`.
- `apps/web-vite/src/components/ui/Input.tsx` — label, error, helperText, required indicator.
- `apps/web-vite/src/components/ui/Badge.tsx` — variants (default, success, warning, error, info), sizes.
- `apps/web-vite/src/components/ui/Dialog.tsx` — portal, overlay, escape/click to close, optional title/description.
- `apps/web-vite/src/components/ui/Select.tsx` — label, error, helperText, options, placeholder.
- `apps/web-vite/src/components/ui/Textarea.tsx` — label, error, helperText.
- `apps/web-vite/src/components/ui/Checkbox.tsx` — checked, indeterminate, sizes.
- `apps/web-vite/src/components/ui/Tabs.tsx` — tab list + content by id.
- `apps/web-vite/src/components/ui/SkipToContent.tsx` — skip link to `#main-content`.
- `apps/web-vite/src/components/ui/CollapsibleNavSection.tsx` — collapsible nav section with chevron.
- `apps/web-vite/src/components/ui/CollapsibleSection.tsx` — collapsible card section (e.g. settings).

**Features**

- `apps/web-vite/src/features/landing/ScrollAnimation.tsx` — IntersectionObserver-based scroll-in animation.
- `apps/web-vite/src/features/landing/Hero.tsx` — hero section with headline, CTAs, stats.
- `apps/web-vite/src/features/landing/Features.tsx` — feature grid with scroll animation.
- `apps/web-vite/src/features/landing/CTA.tsx` — call-to-action section.
- `apps/web-vite/src/features/auth/LoginForm.tsx` — login form (email, password, remember me) using `useAuth`, zod, react-hook-form.
- `apps/web-vite/src/features/auth/SignupForm.tsx` — signup form (name, email, password, confirm, terms) using `useAuth`.
- `apps/web-vite/src/features/contact/ContactForm.tsx` — contact form submitting to API.

**Pages**

- Public: `HomePage`, `LoginPage`, `RegisterPage`, `AboutPage`, `ContactPage`, `TermsPage`, `PrivacyPage`, `HealthPage`, `BannedPage`, `NotFoundPage` (404 with cloud animation).
- Dashboard: `DashboardHomePage`, `TicketsPage`, `TodosPage`, `LinksPage`, `TimeTrackingPage`, `ProfilePage`, `SettingsPage`, `SearchPage`, `NotificationsPage`, `StatisticsPage`, `ArchivePage`.
- Admin: `UsersPage`, `GroupsPage`, `ModulesPage`, `AdminSettingsPage`, `SessionsPage`, `AdminTicketsPage`, `AdminStatisticsPage`, `AuditPage`, `DbConsolePage` (placeholder content for Rust API migration).

**Lib**

- `apps/web-vite/src/lib/constants/config.ts` — `APP_CONFIG` (name from `VITE_APP_NAME`).
- `apps/web-vite/src/lib/constants/routes.ts` — `ROUTES` (same paths as Next.js app).
- `apps/web-vite/src/lib/constants/modules.ts` — `MODULE_KEYS`, `MODULE_CONFIG`.
- `apps/web-vite/src/lib/utils/cn.ts` — clsx + tailwind-merge.
- `apps/web-vite/src/lib/utils/users.ts` — `getAvatarUrl`, `formatUserName`.
- `apps/web-vite/src/lib/hooks/useLocalStorage.ts` — localStorage-backed state.
- `apps/web-vite/src/lib/validations/auth.ts` — zod schemas for login and register.

**Entry and routing**

- `apps/web-vite/src/main.tsx` — React root, StrictMode.
- `apps/web-vite/src/App.tsx` — BrowserRouter, AuthProvider, ThemeProvider, ErrorBoundary, React Router routes (public, dashboard nested, admin nested, 404).
- `apps/web-vite/src/index.css` — Tailwind layers and global styles ported from Next.js (base, utilities, scrollbar, selection, blockquote, lists, etc.).
- `apps/web-vite/src/pages/index.ts` — barrel exports for all pages.
- `apps/web-vite/src/vite-env.d.ts` — Vite client types.

### Changed

- **Monorepo workspace** — `pnpm-workspace.yaml` now includes `apps/web-vite` in addition to `apps/web`.

### Technical notes

- No server-side code in the Vite app: no API routes, server actions, or Prisma; all data via `src/api/client.ts` (configurable `VITE_API_URL`).
- Auth is token-based: login/register return a token stored in localStorage; API client sends `Authorization: Bearer <token>`; 401 clears token and redirects to login.
- React Router mirrors the Next.js URL structure (e.g. `/`, `/login`, `/dashboard`, `/dashboard/tickets`, `/dashboard/admin/users`).
- Static build output is in `apps/web-vite/dist/` and is suitable for CDN deployment.