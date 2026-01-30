/**
 * Production-ready logger utility
 * 
 * Features:
 * - Environment-aware logging (dev vs production)
 * - Structured logging with context
 * - Sensitive data filtering
 * - Performance tracking
 * - Error stack trace capture
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number; // in milliseconds
  userId?: string;
  action?: string;
  path?: string;
}

class Logger {
  private isDevelopment: boolean;
  private isProduction: boolean;
  private sensitiveKeys: Set<string>;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.isProduction = process.env.NODE_ENV === "production";
    
    // Keys to filter from logs to prevent sensitive data leakage
    this.sensitiveKeys = new Set([
      "password",
      "token",
      "secret",
      "apiKey",
      "api_key",
      "accessToken",
      "refreshToken",
      "sessionToken",
      "session",
      "authorization",
      "auth",
      "cookie",
      "cookies",
      "creditCard",
      "credit_card",
      "ssn",
      "socialSecurityNumber",
      "emailVerificationToken",
      "resetToken",
      "verificationToken",
    ]);
  }

  /**
   * Sanitize context data by removing sensitive information
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;

    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      
      // Skip sensitive keys
      if (this.sensitiveKeys.has(lowerKey)) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        sanitized[key] = this.sanitizeContext(value as LogContext);
      } else if (Array.isArray(value)) {
        // Check if array contains objects that need sanitization
        sanitized[key] = value.map((item) =>
          item && typeof item === "object" && !(item instanceof Date)
            ? this.sanitizeContext(item as LogContext)
            : item
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Format error object for logging
   */
  private formatError(error: unknown): LogEntry["error"] {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined, // Only include stack in dev
      };
    }

    if (typeof error === "string") {
      return {
        name: "Error",
        message: error,
      };
    }

    return {
      name: "UnknownError",
      message: String(error),
    };
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context) {
      entry.context = this.sanitizeContext(context);
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  /**
   * Output log entry (can be extended to send to external services)
   */
  private output(entry: LogEntry): void {
    // In production, you might want to send logs to:
    // - CloudWatch, Datadog, Sentry, LogRocket, etc.
    // For now, we'll use console with structured output

    const logMethod = entry.level === "error" ? console.error 
                    : entry.level === "warn" ? console.warn
                    : entry.level === "info" ? console.info
                    : console.debug;

    // In development, use pretty formatting
    if (this.isDevelopment) {
      const emoji = {
        debug: "🔍",
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
      }[entry.level];

      const errorStr = entry.error
        ? `${entry.error.name}: ${entry.error.message}`
        : "";
      logMethod(
        `${emoji} [${entry.level.toUpperCase()}] ${entry.message}`,
        entry.context ?? "",
        errorStr,
        entry.duration ? `(${entry.duration}ms)` : ""
      );
    } else {
      // In production, use JSON format for log aggregation
      logMethod(JSON.stringify(entry));
    }
  }

  /**
   * Debug logs - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const entry = this.createLogEntry("debug", message, context);
      this.output(entry);
    }
  }

  /**
   * Info logs - important operational events
   */
  info(message: string, context?: LogContext): void {
    const entry = this.createLogEntry("info", message, context);
    this.output(entry);
  }

  /**
   * Warning logs - potential issues that don't break functionality
   */
  warn(message: string, context?: LogContext, error?: unknown): void {
    const entry = this.createLogEntry("warn", message, context, error);
    this.output(entry);
  }

  /**
   * Error logs - errors that need attention
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    const entry = this.createLogEntry("error", message, context, error);
    this.output(entry);
  }

  /**
   * Log with performance tracking
   */
  async withTiming<T>(
    message: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      const entry = this.createLogEntry("info", message, {
        ...context,
        duration,
      });
      entry.duration = duration;
      this.output(entry);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const entry = this.createLogEntry("error", `${message} (failed)`, {
        ...context,
        duration,
      }, error);
      entry.duration = duration;
      this.output(entry);
      throw error;
    }
  }

  /**
   * Log user actions for audit trail
   */
  audit(action: string, userId: string, context?: LogContext): void {
    const entry = this.createLogEntry("info", `User action: ${action}`, {
      ...context,
      userId,
      action,
    });
    entry.userId = userId;
    entry.action = action;
    this.output(entry);
  }

  /**
   * Log API requests/responses
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    duration?: number,
    context?: LogContext
  ): void {
    const level: LogLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    const entry = this.createLogEntry(
      level,
      `${method} ${path} - ${statusCode}`,
      {
        ...context,
        method,
        path,
        statusCode,
        duration,
      }
    );
    entry.path = path;
    if (duration) entry.duration = duration;
    this.output(entry);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export types for use in other files
export type { LogContext, LogLevel };
