"use client";

import React from "react";
import { formatDuration, calculateElapsedTime } from "@/lib/utils/time-tracking";
import { type TimeEntryStatus } from "@/generated/prisma";

interface DurationDisplayProps {
  entry: {
    status: TimeEntryStatus;
    totalDuration: number;
    lastResumedAt: Date | null;
    startedAt: Date;
    breaks?: Array<{ startedAt: Date; endedAt: Date | null; duration?: number }>;
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
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    if (entry.status !== "RUNNING") {
      // For non-running entries, calculate with breaks
      setDuration(calculateElapsedTime(entry));
      return;
    }

    // For running entries, calculate the actual elapsed time
    const updateDuration = () => {
      setDuration(calculateElapsedTime(entry));
    };

    // Update immediately
    updateDuration();

    // Update every second for running timers
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [entry, mounted]);

  // For running timers, suppress hydration warning since the value will differ between server and client
  // Server renders totalDuration (static), client calculates actual elapsed time (dynamic)
  if (entry.status === "RUNNING") {
    return (
      <span className={className} suppressHydrationWarning>
        {mounted ? formatDuration(duration) : formatDuration(entry.totalDuration)}
      </span>
    );
  }

  // For non-running entries, always use totalDuration (same on server and client)
  return <span className={className}>{formatDuration(duration)}</span>;
}
