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

export function useActiveTimers() {
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const entries = await getActiveTimeEntries();
      setActiveEntries(entries);
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
