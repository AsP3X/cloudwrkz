import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { TimeEntry } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { DurationDisplay } from "@/components/features/time-tracking/DurationDisplay";
import {
  getStatusColor,
  getStatusLabel,
  canPause,
  canResume,
  canStop,
  formatDuration,
  calculateTotalBreakDuration,
} from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

export default function TimeEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canViewTimeTracking = can("modules.timetracking.view");

  useEffect(() => {
    if (!id || id === "undefined") {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ timeEntry: TimeEntry }>(`/time-tracking/${id}`)
      .then((data) => {
        if (!cancelled) setEntry(data.timeEntry);
      })
      .catch(() => {
        if (!cancelled) {
          setEntry(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!user) navigate(ROUTES.DASHBOARD, { replace: true });
  }, [user, navigate]);

  const refresh = () => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ timeEntry: TimeEntry }>(`/time-tracking/${id}`)
      .then((data) => setEntry(data.timeEntry))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  };

  const handlePause = async () => {
    if (!entry || !canPause(entry.status)) return;
    setProcessing(true);
    setError(null);
    try {
      await api.post(`/time-tracking/${entry.id}/pause`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pause");
    } finally {
      setProcessing(false);
    }
  };

  const handleResume = async () => {
    if (!entry || !canResume(entry.status)) return;
    setProcessing(true);
    setError(null);
    try {
      await api.post(`/time-tracking/${entry.id}/resume`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume");
    } finally {
      setProcessing(false);
    }
  };

  const handleStop = async () => {
    if (!entry || !canStop(entry.status)) return;
    setProcessing(true);
    setError(null);
    try {
      await api.post(`/time-tracking/${entry.id}/stop`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setProcessing(true);
    setError(null);
    try {
      await api.delete(`/time-tracking/${entry.id}`);
      navigate(`${ROUTES.DASHBOARD}/time-tracking`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setProcessing(false);
    }
  };

  if (!canViewTimeTracking && !entry) {
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
            hiddenFields={{ context: "time_entry_detail", entityId: id ?? "" }}
            dialogDescription="If you believe you should have access to the Time Tracking module, please describe why."
          />
        }
        secondaryHref={`${ROUTES.DASHBOARD}/time-tracking`}
        secondaryLabel="Back to Time Tracking"
      />
    );
  }

  if (loading && !entry) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (notFound || !entry) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Time entry not found
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          The time entry you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link to={`${ROUTES.DASHBOARD}/time-tracking`}>
          <Button variant="primary">Back to Time Tracking</Button>
        </Link>
      </div>
    );
  }

  const displayTz = entry.timezone || user?.timezone || "UTC";
  const breakTotal = entry.breaks?.length
    ? calculateTotalBreakDuration(
        entry.breaks.map((b) => ({
          started_at: b.started_at,
          ended_at: b.ended_at,
          duration: b.duration,
        }))
      )
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={`${ROUTES.DASHBOARD}/time-tracking`}>
            <Button variant="outline" size="sm">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Time Tracking
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {entry.name || "Time entry"}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Started {formatDateTimeInTimezone(entry.started_at, displayTz)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium",
              getStatusColor(entry.status)
            )}
          >
            {getStatusLabel(entry.status)}
          </span>
          {canPause(entry.status) && (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={processing}>
              Pause
            </Button>
          )}
          {canResume(entry.status) && (
            <Button variant="outline" size="sm" onClick={handleResume} disabled={processing}>
              Resume
            </Button>
          )}
          {canStop(entry.status) && (
            <Button variant="outline" size="sm" onClick={handleStop} disabled={processing}>
              Stop
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={processing}>
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 p-4 text-sm text-error-700 dark:text-error-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Details
            </h2>
            {entry.description && (
              <p className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap mb-4">
                {entry.description}
              </p>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Started</dt>
                <dd className="font-medium text-neutral-900 dark:text-neutral-100">
                  {formatDateTimeInTimezone(entry.started_at, displayTz)}
                </dd>
              </div>
              {(entry.stopped_at || entry.completed_at) && (
                <div>
                  <dt className="text-neutral-500 dark:text-neutral-400">Ended</dt>
                  <dd className="font-medium text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(
                      entry.stopped_at || entry.completed_at || "",
                      displayTz
                    )}
                  </dd>
                </div>
              )}
              {entry.tags?.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500 dark:text-neutral-400 mb-1">Tags</dt>
                  <dd className="flex flex-wrap gap-2">
                    {entry.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {entry.breaks && entry.breaks.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                Breaks
              </h2>
              <ul className="space-y-2">
                {entry.breaks.map((b) => (
                  <li
                    key={b.id}
                    className="flex justify-between text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <span>
                      {formatDateTimeInTimezone(b.started_at, displayTz)}
                      {b.description && ` — ${b.description}`}
                    </span>
                    <span>{formatDuration(b.duration)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
                Total break time: {formatDuration(breakTotal)}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
              Duration
            </h3>
            <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              <DurationDisplay
                entry={entry}
                className="text-neutral-900 dark:text-neutral-100"
              />
            </div>
            {entry.breaks?.length > 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                Net (excluding breaks): {formatDuration(Math.max(0, entry.total_duration - breakTotal))}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
