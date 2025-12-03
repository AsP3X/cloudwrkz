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
  // Start with totalDuration to match server render (avoid hydration mismatch)
  const [duration, setDuration] = useState(totalDuration);
  const [formatted, setFormatted] = useState(() => formatDuration(totalDuration));
  const [mounted, setMounted] = useState(false);

  // Mark as mounted on client side
  useEffect(() => {
    // Mark as mounted once on client to avoid hydration mismatches
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (status !== "RUNNING") {
      // For non-running entries, use totalDuration directly
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDuration(totalDuration);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormatted(formatDuration(totalDuration));
      return;
    }

    // For running timers, calculate actual elapsed time
    const updateDuration = () => {
      const elapsed = calculateElapsedTime({ status, totalDuration, lastResumedAt, startedAt });
      setDuration(elapsed);
      setFormatted(formatDuration(elapsed));
    };

    // Update immediately
    updateDuration();

    // Update every second for running timers
    const interval = setInterval(updateDuration, updateInterval);

    return () => clearInterval(interval);
  }, [status, totalDuration, lastResumedAt, startedAt, updateInterval, mounted]);

  return {
    duration, // in seconds
    formatted, // formatted string (HH:MM:SS or MM:SS)
  };
}
