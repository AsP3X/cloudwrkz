import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import type { TimeEntry } from "@/lib/types";
import { TimeEntryViewProvider, useTimeEntryView } from "@/components/features/time-tracking/TimeEntryViewContext";
import { TimeEntryViewToggle } from "@/components/features/time-tracking/TimeEntryViewToggle";
import { TimeTrackingFilterButton } from "@/components/features/time-tracking/TimeTrackingFilterButton";
import { TimeEntryList } from "@/components/features/time-tracking/TimeEntryList";
import { StartTimerDialog } from "@/components/features/time-tracking/StartTimerDialog";
import { AddTimeEntryDialog } from "@/components/features/time-tracking/AddTimeEntryDialog";
import { ROUTES } from "@/lib/constants/routes";
import { Link } from "react-router-dom";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function TimeTrackingPageContent() {
  const { modules } = useAuth();
  const [searchParams] = useSearchParams();
  const { viewMode, setViewMode } = useTimeEntryView();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTimerOpen, setStartTimerOpen] = useState(false);
  const [addEntryOpen, setAddEntryOpen] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams(searchParams.toString());
      const status = params.get("status");
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      const data = await api.get<{ timeEntries: TimeEntry[] }>(
        `/time-tracking${query.toString() ? `?${query.toString()}` : ""}`
      );
      let result = data.timeEntries ?? [];
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom && dateTo) {
        const from = new Date(dateFrom).getTime();
        const to = new Date(dateTo).getTime() + 86400000;
        result = result.filter((e) => {
          const t = new Date(e.started_at).getTime();
          return t >= from && t < to;
        });
      }
      setEntries(result);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    fetchEntries();
  }, [fetchEntries]);

  const runningEntries = entries.filter(
    (e) => e.status === "RUNNING" || e.status === "PAUSED"
  );
  const todayEntries = entries.filter((e) => {
    const d = new Date(e.started_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const todaySeconds = todayEntries.reduce(
    (sum, e) => sum + (e.total_duration || 0),
    0 );

  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diffToMonday = (day + 6) % 7;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  const thisWeekEntries = entries.filter((e) => {
    const d = new Date(e.started_at);
    return d >= weekStart && d <= now;
  });
  const weekSeconds = thisWeekEntries.reduce(
    (sum, e) => sum + (e.total_duration || 0),
    0
  );

  if (!modules.includes("time_tracking")) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <p className="text-neutral-500 dark:text-neutral-400">
            The Time Tracking module is not enabled. Contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Time Tracking
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Track time for tasks and projects
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeEntryViewToggle
            currentView={viewMode}
            onViewChange={setViewMode}
          />
          <TimeTrackingFilterButton />
          <Link to={`${ROUTES.ARCHIVE}?type=time`}>
            <Button variant="outline">Archive</Button>
          </Link>
          <Button variant="primary" onClick={() => setStartTimerOpen(true)}>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Start Timer
          </Button>
          <Button variant="outline" onClick={() => setAddEntryOpen(true)}>
            Add Entry
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-5">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Today
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {formatDuration(todaySeconds)}
          </p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-5">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            This Week
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {formatDuration(weekSeconds)}
          </p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-5">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Running Timers
          </p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
            {runningEntries.length}
          </p>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No time entries yet
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Start tracking your time
          </p>
          <Button variant="primary" onClick={() => setStartTimerOpen(true)}>
            Start Timer
          </Button>
        </div>
      ) : (
        <TimeEntryList
          entries={entries}
          userTimezone={undefined}
          onRefresh={fetchEntries}
        />
      )}

      <StartTimerDialog
        open={startTimerOpen}
        onOpenChange={setStartTimerOpen}
        onCreated={fetchEntries}
      />
      <AddTimeEntryDialog
        open={addEntryOpen}
        onOpenChange={setAddEntryOpen}
        onCreated={fetchEntries}
      />
    </div>
  );
}

export default function TimeTrackingPage() {
  const { can } = useAuth();

  if (!can("modules.timetracking.view")) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Time Tracking module. Please contact an
            administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "time_tracking_overview" }}
            dialogDescription="If you believe you should have access to the Time Tracking module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  return (
    <TimeEntryViewProvider>
      <TimeTrackingPageContent />
    </TimeEntryViewProvider>
  );
}
