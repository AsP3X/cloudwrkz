"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { createTimeEntry, getTimeEntriesForTicket, pauseTimeEntry, resumeTimeEntry, stopTimeEntry, getTimerCountForTicket } from "@/server/actions/time-tracking";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { calculateElapsedTime } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";

interface TicketTimerSectionProps {
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  initialTimeEntries: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    startedAt: Date;
    totalDuration: number;
    lastResumedAt: Date | null;
    createdAt: Date;
  }>;
  initialAvailableEntries: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: Date;
  }>;
  userTimezone?: string;
  canCreate?: boolean; // Permission to create time entries
}

export function TicketTimerSection({
  ticketId,
  ticketNumber,
  ticketTitle,
  initialTimeEntries,
  initialAvailableEntries,
  userTimezone = "UTC",
  canCreate = true, // Default to true for backward compatibility
}: TicketTimerSectionProps) {
  const router = useRouter();
  const [timeEntries, setTimeEntries] = React.useState(initialTimeEntries);
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingTimers, setLoadingTimers] = React.useState<Set<string>>(new Set());
  const [tick, setTick] = React.useState(0);
  const [isMounted, setIsMounted] = React.useState(false);

  // Ensure component is mounted before rendering dynamic content to avoid hydration mismatch
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update every second for running timers to show live duration
  React.useEffect(() => {
    if (!isMounted) return;
    
    const hasRunningTimer = timeEntries.some((entry) => entry.status === "RUNNING");
    if (!hasRunningTimer) return;

    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeEntries, isMounted]);

  const handleCreateTimer = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Count existing timers for this ticket to determine the number (all users)
      const existingTimerCount = await getTimerCountForTicket(ticketId);
      const timerNumber = existingTimerCount + 1;
      const timerName = `${ticketNumber} - ${ticketTitle} - ${timerNumber}`;
      const result = await createTimeEntry({
        name: timerName,
        ticketId,
        description: `Timer for ticket ${ticketNumber}`,
      });

      if (result.success) {
        router.refresh();
        // Reload timers
        const updatedEntries = await getTimeEntriesForTicket(ticketId);
        setTimeEntries(updatedEntries);
      } else {
        setError(result.error || "Failed to create timer");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error creating timer:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePauseTimer = async (timerId: string) => {
    setLoadingTimers((prev) => new Set(prev).add(timerId));
    setError(null);

    try {
      const result = await pauseTimeEntry(timerId);
      if (result.success) {
        router.refresh();
        const updatedEntries = await getTimeEntriesForTicket(ticketId);
        setTimeEntries(updatedEntries);
      } else {
        setError(result.error || "Failed to pause timer");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error pausing timer:", err);
    } finally {
      setLoadingTimers((prev) => {
        const next = new Set(prev);
        next.delete(timerId);
        return next;
      });
    }
  };

  const handleResumeTimer = async (timerId: string) => {
    setLoadingTimers((prev) => new Set(prev).add(timerId));
    setError(null);

    try {
      const result = await resumeTimeEntry(timerId);
      if (result.success) {
        router.refresh();
        const updatedEntries = await getTimeEntriesForTicket(ticketId);
        setTimeEntries(updatedEntries);
      } else {
        setError(result.error || "Failed to resume timer");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error resuming timer:", err);
    } finally {
      setLoadingTimers((prev) => {
        const next = new Set(prev);
        next.delete(timerId);
        return next;
      });
    }
  };

  const handleStopTimer = async (timerId: string) => {
    setLoadingTimers((prev) => new Set(prev).add(timerId));
    setError(null);

    try {
      const result = await stopTimeEntry(timerId);
      if (result.success) {
        router.refresh();
        const updatedEntries = await getTimeEntriesForTicket(ticketId);
        setTimeEntries(updatedEntries);
      } else {
        setError(result.error || "Failed to stop timer");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Error stopping timer:", err);
    } finally {
      setLoadingTimers((prev) => {
        const next = new Set(prev);
        next.delete(timerId);
        return next;
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      RUNNING: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
      PAUSED: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300",
      STOPPED: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
      COMPLETED: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    };

    return (
      <span
        className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
          statusColors[status as keyof typeof statusColors] || statusColors.STOPPED
        }`}
      >
        {status}
      </span>
    );
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
          Time Tracking
        </h3>
        <Link href={ROUTES.DASHBOARD + "/time-tracking"}>
          <Button variant="outline" size="sm">
            View All Timers
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-3">
          <p className="text-sm text-error-800">{error}</p>
        </div>
      )}

      {/* Create Timer Button */}
      {canCreate && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateTimer}
            loading={isCreating}
            disabled={isCreating}
          >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Timer
        </Button>
        </div>
      )}

      {/* Timer List */}
      {timeEntries.length > 0 ? (
        <div className="space-y-3">
          {timeEntries.map((entry) => {
            const currentDuration =
              entry.status === "RUNNING"
                ? calculateElapsedTime({
                    status: entry.status,
                    totalDuration: entry.totalDuration,
                    lastResumedAt: entry.lastResumedAt,
                    startedAt: entry.startedAt,
                  })
                : entry.totalDuration;

            const isLoading = loadingTimers.has(entry.id);
            const canPause = isMounted && entry.status === "RUNNING";
            const canResume = isMounted && entry.status === "PAUSED";
            const canStop = isMounted && (entry.status === "RUNNING" || entry.status === "PAUSED");

            const hasControls = isMounted && (canPause || canResume || canStop);
            const containerClassName = hasControls
              ? "flex items-start justify-between gap-4"
              : "flex items-start justify-between";

            return (
              <div
                key={entry.id}
                className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              >
                <div className={containerClassName}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        href={`${ROUTES.DASHBOARD}/time-tracking/${entry.id}`}
                        className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {entry.name}
                      </Link>
                      {getStatusBadge(entry.status)}
                    </div>
                    {entry.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {entry.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-500">
                      <span>Duration: {formatDuration(currentDuration)}</span>
                      <span>
                        Started: {formatDateTimeInTimezone(entry.startedAt, userTimezone)}
                      </span>
                    </div>
                  </div>
                  {isMounted && (canPause || canResume || canStop) && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canPause && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePauseTimer(entry.id)}
                          disabled={isLoading}
                          loading={isLoading}
                          title="Pause timer"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </Button>
                      )}
                      {canResume && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResumeTimer(entry.id)}
                          disabled={isLoading}
                          loading={isLoading}
                          title="Resume timer"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </Button>
                      )}
                      {canStop && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStopTimer(entry.id)}
                          disabled={isLoading}
                          loading={isLoading}
                          title="Stop timer"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 10h6v4H9z"
                            />
                          </svg>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">
          No timers assigned to this ticket yet.
        </p>
      )}
    </div>
  );
}
