/**
 * Base URL for the Rust API (`/api/v1` prefix paths).
 *
 * In dev, if `VITE_API_URL` is absolute (e.g. `http://127.0.0.1:8080/api/v1`), requests go
 * straight to the API and skip the Vite proxy — avoids Node proxy ECONNRESET / socket hang up
 * when the DB is flaky or under load. Requires API CORS to allow the web origin (empty
 * `CORS_ORIGINS` in dev allows any origin with credentials disabled).
 */
// Human: Resolves whether the SPA talks to the Vite proxy path or a direct absolute API URL based on env and dev mode.
// Agent: READS import.meta.env DEV VITE_API_URL; RETURNS normalized base without trailing slash; DEFAULT /api/v1.

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim() || "";
  if (import.meta.env.DEV && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "/api/v1";
  }
  return (configured || "/api/v1").replace(/\/$/, "") || "/api/v1";
}

/**
 * Use with `fetch(..., { credentials })` when calling the API.
 *
 * Cross-origin requests must not use `credentials: "include"` when the API responds with
 * `Access-Control-Allow-Origin: *` (typical when `CORS_ORIGINS` is empty) — browsers block
 * the response and surface "Failed to fetch". Auth uses `Authorization: Bearer`, not cookies,
 * so `omit` is correct for cross-origin API calls (e.g. page on `http://172.25.x.x:5173` and
 * API on `http://localhost:8081`).
 */
// Human: Chooses fetch credentials so same-origin calls can include cookies while cross-origin bearer calls avoid wildcard-CORS pitfalls.
// Agent: READS window SSR-guarded; COMPARES URL origins; RETURNS include or omit; FALLBACK include on parse errors.

export function credentialsForApiFetch(requestUrl: string): RequestCredentials {
  if (typeof window === "undefined") {
    return "same-origin";
  }
  try {
    const resolved = new URL(requestUrl, window.location.href);
    return resolved.origin === window.location.origin ? "include" : "omit";
  } catch {
    return "include";
  }
}
