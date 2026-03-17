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
 * Calculate total break duration in seconds
 */
export function calculateTotalBreakDuration(breaks: Array<{ startedAt: Date; endedAt: Date | null; duration?: number }>): number {
  const now = new Date();
  return breaks.reduce((total, breakRecord) => {
    let breakDuration = breakRecord.duration ?? 0;
    
    // If break hasn't ended, calculate current duration
    if (!breakRecord.endedAt) {
      breakDuration = Math.floor((now.getTime() - breakRecord.startedAt.getTime()) / 1000);
    }
    
    return total + breakDuration;
  }, 0);
}

/**
 * Calculate elapsed time for a time entry
 * Returns total duration + current running time if status is RUNNING, minus break durations
 */
export function calculateElapsedTime(
  entry: {
    status: TimeEntryStatus;
    totalDuration: number;
    lastResumedAt: Date | null;
    startedAt: Date;
    breaks?: Array<{ startedAt: Date; endedAt: Date | null; duration?: number }>;
  }
): number {
  let baseDuration = entry.totalDuration;
  
  if (entry.status === "RUNNING" && entry.lastResumedAt) {
    const now = new Date();
    const runningTime = Math.floor((now.getTime() - entry.lastResumedAt.getTime()) / 1000);
    baseDuration = entry.totalDuration + runningTime;
  } else if (entry.status === "RUNNING" && !entry.lastResumedAt) {
    // Started but never paused
    const now = new Date();
    const runningTime = Math.floor((now.getTime() - entry.startedAt.getTime()) / 1000);
    baseDuration = entry.totalDuration + runningTime;
  }
  
  // Subtract break durations if breaks are provided
  if (entry.breaks && entry.breaks.length > 0) {
    const breakDuration = calculateTotalBreakDuration(entry.breaks);
    baseDuration = Math.max(0, baseDuration - breakDuration);
  }
  
  return baseDuration;
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
 * @deprecated Use generateTimerNumber instead for consistent naming
 */
export function generateRandomTimerName(): string {
  const prefixes = ["Timer", "Session", "Task", "Work"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${randomChars}`;
}

/**
 * Generate a timer number in the format #TMR-000001
 */
export function generateTimerNumber(sequenceNumber: number): string {
  const paddedNumber = sequenceNumber.toString().padStart(6, "0");
  return `#TMR-${paddedNumber}`;
}

/**
 * Parse timer number to extract sequence
 * Returns null if the name doesn't match the TMR-XXXXXX or #TMR-XXXXXX format
 */
export function parseTimerNumber(timerName: string): { prefix: string; sequence: number } | null {
  // Match both TMR-XXXXXX and #TMR-XXXXXX formats
  const match = timerName.match(/^#?TMR-(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    prefix: "TMR",
    sequence: parseInt(match[1], 10),
  };
}

/**
 * Format timer number to ensure it's in #TMR-000000 format (6 digits)
 * If the input is already in TMR-XXXXXX or #TMR-XXXXXX format, it will be reformatted to have 6 digits
 * If the input doesn't match the format, tries to extract TMR pattern from the string
 * For custom names (like "#INC-000001 - Test - 1"), extracts the number and formats as #TMR
 * If no number can be extracted, returns the original string
 */
export function formatTimerNumber(timerName: string, entryId?: string): string {
  // First, try to parse as direct TMR-XXXXXX or #TMR-XXXXXX format
  const parsed = parseTimerNumber(timerName);
  if (parsed) {
    // Reformat to ensure 6 digits with # prefix
    return generateTimerNumber(parsed.sequence);
  }
  
  // Try to find TMR-XXXXXX or #TMR-XXXXXX pattern anywhere in the string
  const tmrPattern = /#?TMR-(\d+)/i;
  const match = timerName.match(tmrPattern);
  if (match) {
    const sequence = parseInt(match[1], 10);
    return generateTimerNumber(sequence);
  }
  
  // For custom names like "#INC-000001 - Test - 1", try to extract the number at the end
  // Pattern: " - 1" or " - 123" at the end of the string
  const customNamePattern = /\s*-\s*(\d+)\s*$/;
  const customMatch = timerName.match(customNamePattern);
  if (customMatch) {
    const sequence = parseInt(customMatch[1], 10);
    return generateTimerNumber(sequence);
  }
  
  // If entryId is provided and no pattern matches, generate a consistent TMR from ID hash
  if (entryId) {
    // Create a simple hash from the entry ID to get a consistent number
    let hash = 0;
    for (let i = 0; i < entryId.length; i++) {
      const char = entryId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and modulo to get a reasonable sequence number (1-999999)
    const sequence = Math.abs(hash) % 999999 + 1;
    return generateTimerNumber(sequence);
  }
  
  // If it doesn't match any pattern and no entryId, return as-is (fallback)
  return timerName;
}
