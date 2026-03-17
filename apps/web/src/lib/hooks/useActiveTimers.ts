"use client";

import { useState, useEffect } from "react";
import { getActiveTimeEntries } from "@/server/actions/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";

type TimeEntry = {
  id: string;
  name: string;
  status: TimeEntryStatus;
  startedAt: Date;
  totalDuration: number;
  lastResumedAt: Date | null;
  currentDuration?: number;
};

/** Normalize server response: dates may be ISO strings after server action serialization. Export for use in TimeTrackingPage. */
export function normalizeActiveEntry(raw: {
  id: string;
  name: string;
  status: TimeEntryStatus;
  startedAt: string | Date;
  totalDuration: number;
  lastResumedAt: string | Date | null;
  currentDuration?: number;
}): TimeEntry {
  return {
    ...raw,
    startedAt: typeof raw.startedAt === "string" ? new Date(raw.startedAt) : raw.startedAt,
    lastResumedAt:
      raw.lastResumedAt == null
        ? null
        : typeof raw.lastResumedAt === "string"
          ? new Date(raw.lastResumedAt)
          : raw.lastResumedAt,
  };
}

export function useActiveTimers() {
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const entries = await getActiveTimeEntries();
      setActiveEntries(Array.isArray(entries) ? entries.map(normalizeActiveEntry) : []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch active timers");
      console.error("Error fetching active timers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveEntries();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchActiveEntries, 5000);

    return () => clearInterval(interval);
  }, []);

  return {
    activeEntries,
    loading,
    error,
    refetch: fetchActiveEntries,
  };
}
