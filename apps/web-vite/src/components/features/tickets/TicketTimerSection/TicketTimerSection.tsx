import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { calculateElapsedTime } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";

// Human: React UI for `TicketTimerSection` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketTimerSection; REACT component; READS props hooks; MAY CALL api client.
type TimeEntryRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  started_at: string;
  total_duration: number;
  last_resumed_at: string | null;
};

interface TicketTimerSectionProps {
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  initialTimeEntries: TimeEntryRow[];
  userTimezone?: string;
  canCreate?: boolean;
  onRefresh?: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TicketTimerSection({
  ticketId,
  ticketNumber,
  ticketTitle,
  initialTimeEntries,
  userTimezone = "UTC",
  canCreate = true,
  onRefresh,
}: TicketTimerSectionProps) {
  const [entries, setEntries] = React.useState<TimeEntryRow[]>(initialTimeEntries);
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingIds, setLoadingIds] = React.useState<Set<string>>(new Set());
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    setEntries(initialTimeEntries);
  }, [initialTimeEntries]);

  React.useEffect(() => {
    const hasRunning = entries.some((e) => e.status === "RUNNING");
    if (!hasRunning) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [entries]);

  const fetchEntries = React.useCallback(async () => {
    try {
      const data = await api.get<{ entries?: TimeEntryRow[] }>(`/time-tracking?ticket_id=${ticketId}`);
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, [ticketId]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      await api.post("/time-tracking", {
        name: `${ticketNumber} - ${ticketTitle}`,
        description: `Timer for ticket ${ticketNumber}`,
        ticket_id: ticketId,
      });
      await fetchEntries();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to create timer");
    } finally {
      setIsCreating(false);
    }
  };

  const handlePause = async (entryId: string) => {
    setLoadingIds((prev) => new Set(prev).add(entryId));
    setError(null);
    try {
      await api.post(`/time-tracking/${entryId}/pause`);
      await fetchEntries();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to pause");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  const handleResume = async (entryId: string) => {
    setLoadingIds((prev) => new Set(prev).add(entryId));
    setError(null);
    try {
      await api.post(`/time-tracking/${entryId}/resume`);
      await fetchEntries();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to resume");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  const handleStop = async (entryId: string) => {
    setLoadingIds((prev) => new Set(prev).add(entryId));
    setError(null);
    try {
      await api.post(`/time-tracking/${entryId}/stop`);
      await fetchEntries();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to stop");
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  const activeEntries = entries.filter((e) => e.status === "RUNNING" || e.status === "PAUSED");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Time Tracking</h3>
        <Link to={`${ROUTES.DASHBOARD}/time-tracking`}>
          <Button variant="outline" size="sm">View All Timers</Button>
        </Link>
      </div>
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-3">
          <p className="text-sm text-error-800 dark:text-error-200">{error}</p>
        </div>
      )}
      {canCreate && (
        <Button variant="primary" size="sm" onClick={handleCreate} loading={isCreating} disabled={isCreating}>
          Create Timer
        </Button>
      )}
      {activeEntries.length > 0 ? (
        <div className="space-y-3">
          {activeEntries.map((entry) => {
            const duration =
              entry.status === "RUNNING"
                ? calculateElapsedTime({
                    status: entry.status,
                    total_duration: entry.total_duration,
                    last_resumed_at: entry.last_resumed_at,
                    started_at: entry.started_at,
                  })
                : entry.total_duration;
            const loading = loadingIds.has(entry.id);
            return (
              <div
                key={entry.id}
                className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      to={`${ROUTES.DASHBOARD}/time-tracking/${entry.id}`}
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {entry.name}
                    </Link>
                    <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                      {entry.status}
                    </span>
                    {entry.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{entry.description}</p>
                    )}
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      Duration: {formatDuration(duration)} • Started: {formatDateTimeInTimezone(entry.started_at, userTimezone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {entry.status === "RUNNING" && (
                      <Button variant="outline" size="sm" onClick={() => handlePause(entry.id)} disabled={loading} loading={loading}>
                        Pause
                      </Button>
                    )}
                    {entry.status === "PAUSED" && (
                      <Button variant="outline" size="sm" onClick={() => handleResume(entry.id)} disabled={loading} loading={loading}>
                        Resume
                      </Button>
                    )}
                    {(entry.status === "RUNNING" || entry.status === "PAUSED") && (
                      <Button variant="outline" size="sm" onClick={() => handleStop(entry.id)} disabled={loading} loading={loading}>
                        Stop
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">No active timers for this ticket.</p>
      )}
    </div>
  );
}
