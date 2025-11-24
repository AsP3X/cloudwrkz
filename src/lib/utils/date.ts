/**
 * Date formatting utilities with consistent locale to prevent hydration mismatches
 * Always uses "en-US" locale to ensure server and client render the same output
 */

/**
 * Format a date as a date string (e.g., "Nov 21, 2025")
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
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
  });
}

/**
 * Format a date as a time string (e.g., "4:11 PM")
 */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
