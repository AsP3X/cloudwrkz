"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { TimeEntryList } from "../TimeEntryList";
import { StartTimerDialog } from "../StartTimerDialog";
import { AddTimeEntryDialog } from "../AddTimeEntryDialog";
import { TimeTrackingFilterButton } from "../TimeTrackingFilterButton";
import { TimeEntryViewToggle } from "../TimeEntryViewToggle";
import { TimeEntryViewProvider, useTimeEntryView } from "../TimeEntryViewContext";
import { getActiveTimeEntries } from "@/server/actions/time-tracking";
import { useTimeTrackingEvents } from "@/lib/hooks/useTimeTrackingEvents";
import { type TimeEntryStatus } from "@prisma/client";
import { calculateElapsedTime } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";

// Client-only component to calculate total time to avoid hydration mismatch
function TotalTimeDisplay({ entries }: { entries: TimeEntry[] }) {
  const [totalHours, setTotalHours] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const calculateTotal = () => {
      const total = entries.reduce((sum, e) => {
        return sum + calculateElapsedTime(e);
      }, 0);
      setTotalHours(Math.floor(total / 3600));
    };

    calculateTotal();

    // Update every second for running timers
    const interval = setInterval(calculateTotal, 1000);

    return () => clearInterval(interval);
  }, [entries, mounted]);

  // Show static value during SSR to match initial client render
  const staticTotal = entries.reduce((sum, e) => sum + e.totalDuration, 0);
  const staticHours = Math.floor(staticTotal / 3600);

  return (
    <div className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1" suppressHydrationWarning>
      {mounted ? totalHours : staticHours}h
    </div>
  );
}

type TimeEntry = {
  id: string;
  name: string;
  description: string | null;
  status: TimeEntryStatus;
  startedAt: Date;
  pausedAt: Date | null;
  stoppedAt: Date | null;
  completedAt: Date | null;
  totalDuration: number;
  lastResumedAt: Date | null;
  tags: string[];
  location: string | null;
  billable: boolean;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
};

interface TimeTrackingPageProps {
  initialEntries: TimeEntry[];
  initialTotal: number;
  initialPage: number;
  userTimezone: string;
}

function TimeTrackingPageContent({ initialEntries, initialTotal, initialPage, userTimezone }: TimeTrackingPageProps) {
  const { viewMode, setViewMode } = useTimeEntryView();
  const [showStartDialog, setShowStartDialog] = React.useState(false);
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [activeEntries, setActiveEntries] = React.useState<TimeEntry[]>(
    initialEntries.filter((e) => e.status === "RUNNING" || e.status === "PAUSED")
  );

  // Use SSE for real-time updates
  useTimeTrackingEvents({
    onEvent: async (event) => {
      // Refresh active entries when events occur
      try {
        const active = await getActiveTimeEntries();
        setActiveEntries(active);
      } catch (error) {
        console.error("Error fetching active entries:", error);
      }
    },
    enabled: true,
  });

  // Fallback: Poll for active entries updates every 30 seconds (as backup)
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const active = await getActiveTimeEntries();
        setActiveEntries(active);
      } catch (error) {
        console.error("Error fetching active entries:", error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Time Tracking</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Track and manage your time entries
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <TimeEntryViewToggle currentView={viewMode} onViewChange={setViewMode} />
          <TimeTrackingFilterButton />
          <Button variant="outline" onClick={() => setShowAddDialog(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Entry
          </Button>
          <Button variant="primary" onClick={() => setShowStartDialog(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Timer
          </Button>
        </div>
      </div>

      {/* Stats Cards - Show before list on all screen sizes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
          <div className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">Total Entries</div>
          <div className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{initialTotal}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
          <div className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">Active Timers</div>
          <div className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {initialEntries.filter((e) => e.status === "RUNNING" || e.status === "PAUSED").length}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
          <div className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">Total Time</div>
          <TotalTimeDisplay entries={initialEntries} />
        </div>
      </div>

      {/* Time Entries List */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <TimeEntryList entries={initialEntries} userTimezone={userTimezone} />
      </div>

      {/* Dialogs */}
      <StartTimerDialog open={showStartDialog} onOpenChange={setShowStartDialog} />
      <AddTimeEntryDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}

export function TimeTrackingPage(props: TimeTrackingPageProps) {
  return (
    <TimeEntryViewProvider>
      <TimeTrackingPageContent {...props} />
    </TimeEntryViewProvider>
  );
}
