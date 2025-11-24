"use client";

import React from "react";
import { formatDuration, calculateElapsedTime } from "@/lib/utils/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";

interface DurationDisplayProps {
  entry: {
    status: TimeEntryStatus;
    totalDuration: number;
    lastResumedAt: Date | null;
    startedAt: Date;
  };
  className?: string;
}

export function DurationDisplay({ entry, className }: DurationDisplayProps) {
  // Always start with totalDuration to match server render
  // This ensures server and client render the same initial value
  const [duration, setDuration] = React.useState<number>(entry.totalDuration);
  const [mounted, setMounted] = React.useState(false);

  // Only calculate live duration on client after mount to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
    
    // For running entries, calculate the actual elapsed time after mount
    if (entry.status === "RUNNING") {
      setDuration(calculateElapsedTime(entry));
    }
  }, [entry.status, entry.totalDuration, entry.lastResumedAt, entry.startedAt]);

  React.useEffect(() => {
    if (!mounted) return;

    if (entry.status !== "RUNNING") {
      setDuration(entry.totalDuration);
      return;
    }

    // Update every second for running timers
    const interval = setInterval(() => {
      setDuration(calculateElapsedTime(entry));
    }, 1000);

    return () => clearInterval(interval);
  }, [entry.status, entry.totalDuration, entry.lastResumedAt, entry.startedAt, mounted]);

  // For running timers, suppress hydration warning since the value will differ between server and client
  // Server renders totalDuration (which might be 0), client calculates actual elapsed time
  if (entry.status === "RUNNING") {
    return <span className={className} suppressHydrationWarning>{formatDuration(duration)}</span>;
  }

  return <span className={className}>{formatDuration(duration)}</span>;
}
