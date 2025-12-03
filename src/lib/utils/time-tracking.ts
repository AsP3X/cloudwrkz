import { type TimeEntryStatus } from "@prisma/client";

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "00:00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Parse duration string (HH:MM:SS or MM:SS) to seconds
 */
export function parseDuration(input: string): number {
  const parts = input.split(":").map(Number);
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

/**
 * Calculate elapsed time for a time entry
 * Returns total duration + current running time if status is RUNNING
 */
export function calculateElapsedTime(entry: {
  status: TimeEntryStatus;
  totalDuration: number;
  lastResumedAt: Date | null;
  startedAt: Date;
}): number {
  if (entry.status === "RUNNING" && entry.lastResumedAt) {
    const now = new Date();
    const runningTime = Math.floor((now.getTime() - entry.lastResumedAt.getTime()) / 1000);
    return entry.totalDuration + runningTime;
  } else if (entry.status === "RUNNING" && !entry.lastResumedAt) {
    // Started but never paused
    const now = new Date();
    const runningTime = Math.floor((now.getTime() - entry.startedAt.getTime()) / 1000);
    return entry.totalDuration + runningTime;
  }
  
  return entry.totalDuration;
}

/**
 * Get status color for badge display
 */
export function getStatusColor(status: TimeEntryStatus): string {
  switch (status) {
    case "RUNNING":
      return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
    case "PAUSED":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
    case "STOPPED":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    case "COMPLETED":
      return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
}

/**
 * Get status label
 */
export function getStatusLabel(status: TimeEntryStatus): string {
  switch (status) {
    case "RUNNING":
      return "Running";
    case "PAUSED":
      return "Paused";
    case "STOPPED":
      return "Stopped";
    case "COMPLETED":
      return "Completed";
    default:
      return status;
  }
}

/**
 * Check if a status can be paused
 */
export function canPause(status: TimeEntryStatus): boolean {
  return status === "RUNNING";
}

/**
 * Check if a status can be resumed
 */
export function canResume(status: TimeEntryStatus): boolean {
  return status === "PAUSED";
}

/**
 * Check if a status can be stopped
 */
export function canStop(status: TimeEntryStatus): boolean {
  return status === "RUNNING" || status === "PAUSED";
}

/**
 * Generate a random timer name
 */
export function generateRandomTimerName(): string {
  const prefixes = ["Timer", "Session", "Task", "Work"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${randomChars}`;
}
