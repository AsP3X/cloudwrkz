import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const DEV_LOG_PATH = "/__dev-log";

function parseAllowedHostList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

/**
 * Hostnames for `server.allowedHosts` (Vite 6+ DNS rebinding guard).
 * Prefer **`CLOUD_WRKZ_DEV_ALLOWED_HOSTS`** in Docker / `.env` — it is not `VITE_`-prefixed, so Vite’s
 * config pre-bundle does not strip or inline it the way it can for `process.env.VITE_*`.
 * `VITE_DEV_ALLOWED_HOSTS` is still read via `loadEnv` + bracket `process.env` as a legacy alias.
 */
function devAllowedHostsFromEnv(loadedEnv: Record<string, string>): string[] {
  const pairs: [string | undefined, string | undefined][] = [
    [process.env.CLOUD_WRKZ_DEV_ALLOWED_HOSTS, loadedEnv.CLOUD_WRKZ_DEV_ALLOWED_HOSTS],
    [process.env["VITE_DEV_ALLOWED_HOSTS"], loadedEnv.VITE_DEV_ALLOWED_HOSTS],
    [process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS, loadedEnv.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS],
  ];
  for (const [fromProcess, fromFile] of pairs) {
    const list = parseAllowedHostList(fromProcess ?? fromFile);
    if (list.length > 0) return list;
  }
  return [];
}

function attachProxyErrorHandler(proxy: any, routePrefix: string, upstreamName: string) {
  proxy.on("error", (err: Error & { code?: string }, req: any, res: any) => {
    const ts = new Date().toISOString();
    const reqUrl = req?.url || routePrefix;
    const code = err?.code || "PROXY_ERROR";
    console.warn(
      `${ts}  WARN  [web-vite] ${routePrefix} proxy unavailable (${upstreamName}) ${reqUrl} ${code}: ${err?.message || "Unknown error"}`
    );

    if (res.headersSent) return;

    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    const isReset =
      err?.code === "ECONNRESET" ||
      err?.code === "ECONNREFUSED" ||
      err?.code === "ETIMEDOUT" ||
      err?.message?.toLowerCase().includes("socket hang up");
    const hint = isReset
      ? " If the API process is running, set VITE_API_URL=http://127.0.0.1:8080/api/v1 in apps/web-vite/.env to bypass the dev proxy (avoids Node proxy ECONNRESET)."
      : "";
    res.end(
      JSON.stringify({
        error: {
          code: "BACKEND_UNAVAILABLE",
          message: `${upstreamName} is unavailable. Start the backend and try again.${hint}`,
        },
      })
    );
  });
}

/** Startup log + middleware so browser can send logs to the Vite terminal. */
function cloudwrkzLogPlugin() {
  return {
    name: "cloudwrkz-log",
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(DEV_LOG_PATH) || (req.method !== "POST" && req.method !== "OPTIONS")) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const { level, message, data } = JSON.parse(body || "{}");
            const ts = new Date().toISOString();
            const line = data != null ? `${ts} ${(level || "ERROR").toUpperCase().padEnd(5)} [web-vite] ${message} ${JSON.stringify(data)}` : `${ts} ${(level || "ERROR").toUpperCase().padEnd(5)} [web-vite] ${message}`;
            console.log(line);
          } catch {
            console.log(body || "(invalid dev-log body)");
          }
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end();
        });
      });
      return () => {
        const ts = new Date().toISOString();
        console.log(
          `${ts}  INFO  [web-vite] CloudWrkz dev server ready — client errors will also appear here (POST ${DEV_LOG_PATH})`
        );
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Docker Compose: proxy from inside the Vite container to the API service (not passed to the client).
  const dockerApiProxy = process.env.DOCKER_API_PROXY_TARGET?.trim();

  // Prefer 127.0.0.1 over "localhost" to avoid IPv6/IPv4 mismatch (ECONNRESET) on Windows.
  let apiProxyTarget = "http://127.0.0.1:8080";
  const configuredApiUrl = env.VITE_API_URL;

  if (dockerApiProxy) {
    apiProxyTarget = dockerApiProxy;
  } else if (configuredApiUrl && /^https?:\/\//i.test(configuredApiUrl)) {
    // If VITE_API_URL is absolute (e.g. http://localhost:8081/api/v1), use its origin for dev proxy.
    try {
      const parsed = new URL(configuredApiUrl);
      if (parsed.hostname === "localhost") {
        parsed.hostname = "127.0.0.1";
      }
      apiProxyTarget = parsed.origin;
    } catch {
      // Keep fallback target when URL parsing fails.
    }
  }

  const extraAllowedHosts = devAllowedHostsFromEnv(env);

  return {
    plugins: [react(), cloudwrkzLogPlugin()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      ...(extraAllowedHosts.length > 0 ? { allowedHosts: extraAllowedHosts } : {}),
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          timeout: 120_000,
          proxyTimeout: 120_000,
          configure: (proxy) => {
            attachProxyErrorHandler(proxy, "/api", "API backend");
          },
        },
        // Proxy for legacy Next.js API (used for fuzzy search endpoints).
        // The Vite app calls `/next-api/...`, which is rewritten to `/api/...` on the Next.js server.
        "/next-api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/next-api/, "/api"),
          configure: (proxy) => {
            attachProxyErrorHandler(proxy, "/next-api", "Search backend");
          },
        },
      },
    },
  };
});
