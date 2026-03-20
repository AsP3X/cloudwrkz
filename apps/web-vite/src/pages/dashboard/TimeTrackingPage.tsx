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
import { FloatingTimerWidget } from "@/components/features/time-tracking/FloatingTimerWidget";
import { ROUTES } from "@/lib/constants/routes";
import { Link } from "react-router-dom";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { calculateElapsedTime } from "@/lib/utils/time-tracking";

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateStart(value: string): number | null {
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

/** Total time (hours) from entries, updating every second when there are running timers */
function TotalTimeDisplay({ entries }: { entries: TimeEntry[] }) {
  const [totalHours, setTotalHours] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const calc = () => {
      const total = entries.reduce((sum, e) => sum + calculateElapsedTime(e), 0);
      setTotalHours(Math.floor(total / 3600));
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [entries, mounted]);

  const staticTotal = entries.reduce((sum, e) => sum + (e.total_duration || 0), 0);
  const staticHours = Math.floor(staticTotal / 3600);

  return (
    <span className="text-sm sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 sm:block sm:mt-1">
      {mounted ? totalHours : staticHours}h
    </span>
  );
}

function TimeTrackingPageContent() {
  const { modules, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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
        const from = parseLocalDateStart(dateFrom);
        const toStart = parseLocalDateStart(dateTo);
        if (from !== null && toStart !== null) {
          const to = toStart + 86400000;
          result = result.filter((e) => {
            const t = new Date(e.started_at).getTime();
            return t >= from && t < to;
          });
        }
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

  const dateFromParam = searchParams.get("dateFrom") || "";
  const dateToParam = searchParams.get("dateTo") || "";
  const today = new Date();
  const todayStr = formatDateForInput(today);
  const weekStart = new Date(today);
  const diffToMonday = (today.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  const weekStartStr = formatDateForInput(weekStart);
  const monthStart = new Date(today);
  monthStart.setDate(1);
  const monthStartStr = formatDateForInput(monthStart);
  const yearStart = new Date(today);
  yearStart.setMonth(0, 1);
  const yearStartStr = formatDateForInput(yearStart);

  type QuickRange = "today" | "thisWeek" | "thisMonth" | "thisYear";
  let activeRange: QuickRange | null = null;
  if (dateFromParam && dateToParam) {
    if (dateFromParam === todayStr && dateToParam === todayStr) activeRange = "today";
    else if (dateFromParam === weekStartStr && dateToParam === todayStr) activeRange = "thisWeek";
    else if (dateFromParam === monthStartStr && dateToParam === todayStr) activeRange = "thisMonth";
    else if (dateFromParam === yearStartStr && dateToParam === todayStr) activeRange = "thisYear";
  }

  const handleQuickRange = useCallback(
    (range: QuickRange) => {
      const params = new URLSearchParams(searchParams.toString());
      const now = new Date();
      const end = new Date(now);
      const start = new Date(now);
      let rangeFrom: string;
      let rangeTo = formatDateForInput(end);

      if (range === "today") {
        rangeFrom = formatDateForInput(start);
      } else if (range === "thisWeek") {
        const dayOfWeek = start.getDay();
        const diffMonday = (dayOfWeek + 6) % 7;
        start.setDate(start.getDate() - diffMonday);
        rangeFrom = formatDateForInput(start);
      } else if (range === "thisMonth") {
        start.setDate(1);
        rangeFrom = formatDateForInput(start);
      } else {
        start.setMonth(0, 1);
        rangeFrom = formatDateForInput(start);
      }

      const currentFrom = params.get("dateFrom") || "";
      const currentTo = params.get("dateTo") || "";
      if (currentFrom === rangeFrom && currentTo === rangeTo) {
        params.delete("dateFrom");
        params.delete("dateTo");
      } else {
        params.set("dateFrom", rangeFrom);
        params.set("dateTo", rangeTo);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const userTimezone = (user as { timezone?: string } | undefined)?.timezone ?? "UTC";

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
            Track and manage your time entries
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

      {/* Stats cards: Total Entries, Active Timers, Total Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Entries</div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{entries.length}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Active Timers</div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{runningEntries.length}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Time</div>
          <TotalTimeDisplay entries={entries} />
        </div>
      </div>

      {/* Timeframe quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">Timeframe:</span>
        <Button
          variant={activeRange === "today" ? "primary" : "ghost"}
          size="sm"
          onClick={() => handleQuickRange("today")}
          aria-pressed={activeRange === "today"}
        >
          Today
        </Button>
        <Button
          variant={activeRange === "thisWeek" ? "primary" : "ghost"}
          size="sm"
          onClick={() => handleQuickRange("thisWeek")}
          aria-pressed={activeRange === "thisWeek"}
        >
          This week
        </Button>
        <Button
          variant={activeRange === "thisMonth" ? "primary" : "ghost"}
          size="sm"
          onClick={() => handleQuickRange("thisMonth")}
          aria-pressed={activeRange === "thisMonth"}
        >
          This month
        </Button>
        <Button
          variant={activeRange === "thisYear" ? "primary" : "ghost"}
          size="sm"
          onClick={() => handleQuickRange("thisYear")}
          aria-pressed={activeRange === "thisYear"}
        >
          This year
        </Button>
      </div>

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
          userTimezone={userTimezone}
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
      {runningEntries.length > 0 && (
        <FloatingTimerWidget
          activeEntries={runningEntries}
          onRefresh={fetchEntries}
        />
      )}
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
