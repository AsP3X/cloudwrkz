export type SanitizableContext = Record<string, unknown>;

/** Keys to filter from log/audit context to prevent sensitive data leakage */
const RAW_SENSITIVE_KEYS = [
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
] as const;

/** Lowercased set used for case-insensitive matching */
export const SENSITIVE_KEYS = new Set<string>(
  RAW_SENSITIVE_KEYS.map((key) => key.toLowerCase())
);

/**
 * Recursively sanitize a context object by redacting values for sensitive keys.
 * Used by both the structured logger and the audit log writer to keep behavior aligned.
 */
export function sanitizeContext(
  context: SanitizableContext | null | undefined
): SanitizableContext | undefined {
  if (!context) return undefined;

  const out: SanitizableContext = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      out[key] = "[REDACTED]";
      continue;
    }

    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      out[key] = sanitizeContext(value as SanitizableContext) ?? {};
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item != null &&
        typeof item === "object" &&
        !(item instanceof Date)
          ? sanitizeContext(item as SanitizableContext)
          : item
      );
    } else {
      out[key] = value;
    }
  }

  return out;
}

