import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const DEV_LOG_PATH = "/__dev-log";

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

export default defineConfig({
  plugins: [react(), cloudwrkzLogPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
