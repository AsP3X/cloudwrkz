/**
 * Client logger aligned with the Rust API (tracing-style levels).
 * Level: VITE_LOG_LEVEL (default: info in dev, warn in prod).
 * Format: VITE_LOG_FORMAT=json for NDJSON suitable for log analysis (Datadog, ELK, Splunk).
 * In dev, error and warn are also sent to the Vite dev server so they appear in the terminal.
 */

const LEVELS = ["trace", "debug", "info", "warn", "error", "silent"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_ORDER: Record<Level, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

/** Service name for log analysis tools (e.g. filter by service). */
const SERVICE_NAME = "web-vite";

function getMinLevel(): Level {
  const env = import.meta.env.VITE_LOG_LEVEL as string | undefined;
  if (env && LEVELS.includes(env as Level)) return env as Level;
  return import.meta.env.DEV ? "info" : "warn";
}

function useJsonFormat(): boolean {
  return (import.meta.env.VITE_LOG_FORMAT as string) === "json";
}

const minOrder = LEVEL_ORDER[getMinLevel()];

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= minOrder && level !== "silent";
}

/** Build one NDJSON object for log analyzers (timestamp, level, message, service, context). */
function formatJson(level: Level, message: string, data?: unknown): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    service: SERVICE_NAME,
  };
  if (data !== undefined) {
    try {
      entry.context =
        typeof data === "object" && data !== null && !Array.isArray(data)
          ? data
          : { value: data };
    } catch {
      entry.context = { value: String(data) };
    }
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({
      ...entry,
      context: { error: "serialization error" },
    });
  }
}

function formatPayload(level: Level, message: string, data?: unknown): string {
  if (useJsonFormat()) return formatJson(level, message, data);
  const ts = new Date().toISOString();
  const prefix = `${ts} ${level.toUpperCase().padEnd(5)} [${SERVICE_NAME}]`;
  if (data === undefined) return `${prefix} ${message}`;
  try {
    return `${prefix} ${message} ${typeof data === "object" ? JSON.stringify(data) : String(data)}`;
  } catch {
    return `${prefix} ${message} [serialization error]`;
  }
}

/** In dev, send error/warn to Vite terminal so they appear where you run `pnpm dev`. */
function sendToDevServer(level: "warn" | "error", message: string, data?: unknown): void {
  if (!import.meta.env.DEV || typeof fetch === "undefined") return;
  try {
    fetch("/__dev-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, data }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export const log = {
  trace(message: string, data?: unknown): void {
    if (shouldLog("trace")) {
      console.debug(formatPayload("trace", message, data));
    }
  },

  debug(message: string, data?: unknown): void {
    if (shouldLog("debug")) {
      console.debug(formatPayload("debug", message, data));
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog("info")) {
      console.info(formatPayload("info", message, data));
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog("warn")) {
      console.warn(formatPayload("warn", message, data));
      sendToDevServer("warn", message, data);
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatPayload("error", message, data));
      sendToDevServer("error", message, data);
    }
  },
};
