/**
 * Date formatting utilities with consistent locale and timezone to prevent hydration mismatches
 * Always uses "en-US" locale and UTC timezone to ensure server and client render the same output
 * Uses Intl.DateTimeFormat for deterministic formatting
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateUTC(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

function formatAMPM(hour: number): { hour12: number; ampm: string } {
  if (hour === 0) return { hour12: 12, ampm: "AM" };
  if (hour < 12) return { hour12: hour, ampm: "AM" };
  if (hour === 12) return { hour12: 12, ampm: "PM" };
  return { hour12: hour - 12, ampm: "PM" };
}

function padZero(num: number): string {
  return num.toString().padStart(2, "0");
}

/**
 * Format a Date for use as the value of an <input type="datetime-local" />.
 * Uses local time (not UTC) so the displayed value matches what the user types
 * and does not flip (e.g. "20" → "02") on each keystroke.
 */
export function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  const h = padZero(date.getHours());
  const min = padZero(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * Format a date as a date string (e.g., "Nov 21, 2025")
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const { year, month, day } = formatDateUTC(d);
  return `${MONTHS[month]} ${day}, ${year}`;
}

/**
 * Format a date as a date-time string (e.g., "Nov 21, 2025, 4:11 PM")
 */
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const { year, month, day, hour, minute } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${MONTHS[month]} ${day}, ${year}, ${hour12}:${padZero(minute)} ${ampm}`;
}

/**
 * Format a date as a full date-time string (e.g., "Nov 21, 2025, 4:11:55 PM")
 */
export function formatDateTimeFull(date: Date | string): string {
  const d = new Date(date);
  const { year, month, day, hour, minute, second } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${MONTHS[month]} ${day}, ${year}, ${hour12}:${padZero(minute)}:${padZero(second)} ${ampm}`;
}

/**
 * Format a date as a time string (e.g., "4:11 PM")
 */
export function formatTime(date: Date | string): string {
  const d = new Date(date);
  const { hour, minute } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${hour12}:${padZero(minute)} ${ampm}`;
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

/**
 * Format a date (without time) in a specific IANA timezone (e.g., "Europe/Berlin")
 * using a deterministic "en-US" locale so server and client match.
 */
export function formatDateInTimezone(
  date: Date | string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(date));
}
