/**
 * Client logger aligned with the Rust API (tracing-style levels).
 * Level controlled by VITE_LOG_LEVEL (default: info in dev, warn in prod).
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

function getMinLevel(): Level {
  const env = import.meta.env.VITE_LOG_LEVEL as string | undefined;
  if (env && LEVELS.includes(env as Level)) return env as Level;
  return import.meta.env.DEV ? "info" : "warn";
}

const minOrder = LEVEL_ORDER[getMinLevel()];

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= minOrder && level !== "silent";
}

function formatPayload(level: Level, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `${ts} ${level.toUpperCase().padEnd(5)} [web-vite]`;
  if (data === undefined) return `${prefix} ${message}`;
  try {
    return `${prefix} ${message} ${typeof data === "object" ? JSON.stringify(data) : String(data)}`;
  } catch {
    return `${prefix} ${message} [serialization error]`;
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
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatPayload("error", message, data));
    }
  },
};
