// Human: Timer-facing duration math and labels—formats elapsed seconds, parses manual inputs, and derives live running totals.
// Agent: parseAsUTC APPENDS Z; calculateElapsedTime READS RUNNING status breaks; STATUS helpers return tailwind labels booleans.

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

export function parseDuration(input: string): number {
  const parts = input.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseAsUTC(dateStr: string): number {
  if (/[Zz]$/.test(dateStr) || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr).getTime();
  }
  return new Date(`${dateStr}Z`).getTime();
}

export function calculateTotalBreakDuration(
  breaks: Array<{ started_at: string; ended_at: string | null; duration: number }>
): number {
  const now = Date.now();
  return breaks.reduce((total, b) => {
    if (!b.ended_at) {
      return total + Math.floor((now - parseAsUTC(b.started_at)) / 1000);
    }
    return total + (b.duration ?? 0);
  }, 0);
}

export function calculateElapsedTime(entry: {
  status: string;
  total_duration: number;
  last_resumed_at: string | null;
  started_at: string;
  breaks?: Array<{ started_at: string; ended_at: string | null; duration: number }>;
}): number {
  let baseDuration = entry.total_duration;

  if (entry.status === "RUNNING" && entry.last_resumed_at) {
    const runningTime = Math.floor(
      (Date.now() - parseAsUTC(entry.last_resumed_at)) / 1000
    );
    baseDuration = entry.total_duration + runningTime;
  } else if (entry.status === "RUNNING" && !entry.last_resumed_at) {
    const runningTime = Math.floor(
      (Date.now() - parseAsUTC(entry.started_at)) / 1000
    );
    baseDuration = entry.total_duration + runningTime;
  }

  if (entry.breaks && entry.breaks.length > 0) {
    baseDuration = Math.max(0, baseDuration - calculateTotalBreakDuration(entry.breaks));
  }

  return baseDuration;
}

export function getStatusColor(status: string): string {
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

export function getStatusLabel(status: string): string {
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

export function canPause(status: string): boolean {
  return status === "RUNNING";
}

export function canResume(status: string): boolean {
  return status === "PAUSED";
}

export function canStop(status: string): boolean {
  return status === "RUNNING" || status === "PAUSED";
}

export function generateTimerNumber(sequenceNumber: number): string {
  const paddedNumber = sequenceNumber.toString().padStart(6, "0");
  return `#TMR-${paddedNumber}`;
}

export function parseTimerNumber(timerName: string): { prefix: string; sequence: number } | null {
  const match = timerName.match(/^#?TMR-(\d+)$/i);
  if (!match) return null;
  return { prefix: "TMR", sequence: parseInt(match[1], 10) };
}

export function formatTimerNumber(timerName: string, entryId?: string): string {
  const parsed = parseTimerNumber(timerName);
  if (parsed) return generateTimerNumber(parsed.sequence);

  const tmrPattern = /#?TMR-(\d+)/i;
  const match = timerName.match(tmrPattern);
  if (match) return generateTimerNumber(parseInt(match[1], 10));

  const customNamePattern = /\s*-\s*(\d+)\s*$/;
  const customMatch = timerName.match(customNamePattern);
  if (customMatch) return generateTimerNumber(parseInt(customMatch[1], 10));

  if (entryId) {
    let hash = 0;
    for (let i = 0; i < entryId.length; i++) {
      hash = ((hash << 5) - hash) + entryId.charCodeAt(i);
      hash = hash & hash;
    }
    return generateTimerNumber(Math.abs(hash) % 999999 + 1);
  }

  return timerName;
}
