const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseApiDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  if (/[Zz]$/.test(date) || /[+-]\d{2}:\d{2}$/.test(date)) return new Date(date);
  return new Date(`${date}Z`);
}

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

export function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  const h = padZero(date.getHours());
  const min = padZero(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function formatDate(date: Date | string): string {
  const d = parseApiDate(date);
  const { year, month, day } = formatDateUTC(d);
  return `${MONTHS[month]} ${day}, ${year}`;
}

export function formatDateTime(date: Date | string): string {
  const d = parseApiDate(date);
  const { year, month, day, hour, minute } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${MONTHS[month]} ${day}, ${year}, ${hour12}:${padZero(minute)} ${ampm}`;
}

export function formatDateTimeFull(date: Date | string): string {
  const d = parseApiDate(date);
  const { year, month, day, hour, minute, second } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${MONTHS[month]} ${day}, ${year}, ${hour12}:${padZero(minute)}:${padZero(second)} ${ampm}`;
}

export function formatTime(date: Date | string): string {
  const d = parseApiDate(date);
  const { hour, minute } = formatDateUTC(d);
  const { hour12, ampm } = formatAMPM(hour);
  return `${hour12}:${padZero(minute)} ${ampm}`;
}

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
  }).format(parseApiDate(date));
}

export function formatDateInTimezone(
  date: Date | string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(parseApiDate(date));
}
