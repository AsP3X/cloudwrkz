"use client";

import { useState, useEffect } from "react";
import { calculateElapsedTime, formatDuration } from "@/lib/utils/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";

interface UseTimerDurationProps {
  status: TimeEntryStatus;
  totalDuration: number;
  lastResumedAt: Date | null;
  startedAt: Date;
  updateInterval?: number; // milliseconds, default 1000 (1 second)
}

export function useTimerDuration({
  status,
  totalDuration,
  lastResumedAt,
  startedAt,
  updateInterval = 1000,
}: UseTimerDurationProps) {
  const [duration, setDuration] = useState(() =>
    calculateElapsedTime({ status, totalDuration, lastResumedAt, startedAt })
  );
  const [formatted, setFormatted] = useState(() => formatDuration(duration));

  useEffect(() => {
    if (status !== "RUNNING") {
      const elapsed = calculateElapsedTime({ status, totalDuration, lastResumedAt, startedAt });
      setDuration(elapsed);
      setFormatted(formatDuration(elapsed));
      return;
    }

    // Update every second for running timers
    const interval = setInterval(() => {
      const elapsed = calculateElapsedTime({ status, totalDuration, lastResumedAt, startedAt });
      setDuration(elapsed);
      setFormatted(formatDuration(elapsed));
    }, updateInterval);

    return () => clearInterval(interval);
  }, [status, totalDuration, lastResumedAt, startedAt, updateInterval]);

  return {
    duration, // in seconds
    formatted, // formatted string (HH:MM:SS or MM:SS)
  };
}
