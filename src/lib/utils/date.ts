/**
 * Date formatting utilities with consistent locale and timezone to prevent hydration mismatches
 * Always uses "en-US" locale and UTC timezone to ensure server and client render the same output
 */

/**
 * Format a date as a date string (e.g., "Nov 21, 2025")
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format a date as a date-time string (e.g., "Nov 21, 2025, 4:11 PM")
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Format a date as a full date-time string (e.g., "Nov 21, 2025, 4:11:55 PM")
 */
export function formatDateTimeFull(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Format a date as a time string (e.g., "4:11 PM")
 */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Format a date-time in a specific IANA timezone (e.g., "Europe/Berlin")
 * using a deterministic "en-US" locale so server and client match.
 */
export function formatDateTimeInTimezone(
  date: Date | string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).format(new Date(date));
}
