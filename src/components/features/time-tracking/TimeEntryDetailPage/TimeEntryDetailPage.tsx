"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DurationDisplay } from "../DurationDisplay";
import { getStatusColor, getStatusLabel, formatDuration, canPause, canResume, canStop, calculateTotalBreakDuration } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { getTimezoneLabel } from "@/lib/constants/timezones";
import { pauseTimeEntry, resumeTimeEntry, stopTimeEntry, completeTimeEntry, deleteTimeEntry, updateTimeEntry } from "@/server/actions/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";
import { TimeEntryEditForm } from "../TimeEntryEditForm";
import { TimeEntryBreaks } from "../TimeEntryBreaks";
import { cn } from "@/lib/utils/cn";

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
  billable: boolean;
  location: string | null;
  timezone: string | null;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  breaks?: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    duration: number;
    description: string | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

interface TimeEntryDetailPageProps {
  initialEntry: TimeEntry;
  userTimezone: string;
}

export function TimeEntryDetailPage({ initialEntry, userTimezone }: TimeEntryDetailPageProps) {
  const router = useRouter();
  const [entry, setEntry] = React.useState<TimeEntry>(initialEntry);
  const [isEditing, setIsEditing] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Update entry when initialEntry changes (after router.refresh())
  React.useEffect(() => {
    setEntry(initialEntry);
  }, [initialEntry]);

  // Use entry timezone if set, otherwise fall back to user timezone
  const displayTimezone = React.useMemo(() => {
    return entry.timezone || userTimezone || "UTC";
  }, [entry.timezone, userTimezone]);
  
  const formatDate = React.useCallback((date: Date) => {
    return formatDateTimeInTimezone(date, displayTimezone);
  }, [displayTimezone]);

  // Create handler functions that directly call server actions to avoid serialization issues
  // Wrapping server actions in arrow functions causes hash mismatches in production builds
  const handlePause = React.useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const result = await pauseTimeEntry(entry.id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "An error occurred");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
    } finally {
      setProcessing(false);
    }
  }, [entry.id, router]);

  const handleResume = React.useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const result = await resumeTimeEntry(entry.id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "An error occurred");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
    } finally {
      setProcessing(false);
    }
  }, [entry.id, router]);

  const handleStop = React.useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const result = await stopTimeEntry(entry.id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "An error occurred");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
    } finally {
      setProcessing(false);
    }
  }, [entry.id, router]);

  const handleComplete = React.useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const result = await completeTimeEntry(entry.id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "An error occurred");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred");
    } finally {
      setProcessing(false);
    }
  }, [entry.id, router]);

  const handleUpdate = async (data: any) => {
    setProcessing(true);
    setError(null);
    try {
      // Normalize timezone: empty string becomes null
      const normalizedData = {
        ...data,
        timezone: data.timezone === "" ? null : data.timezone,
      };
      
      const result = await updateTimeEntry(entry.id, normalizedData);
      if (result.success) {
        setIsEditing(false);
        // Update local state immediately with normalized data
        setEntry((prev) => ({
          ...prev,
          ...normalizedData,
        }));
        // Refresh the page data to get the latest entry from the server
        router.refresh();
      } else {
        setError(result.error || "Failed to update time entry");
      }
    } catch (error: any) {
      setError(error.message || "Failed to update time entry");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this time entry? This action cannot be undone.")) {
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const result = await deleteTimeEntry(entry.id);
      if (result.success) {
        router.push("/dashboard/time-tracking");
      } else {
        setError(result.error || "Failed to delete time entry");
      }
    } catch (error: any) {
      setError(error.message || "Failed to delete time entry");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href="/dashboard/time-tracking">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Time Tracking
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{entry.name}</h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              Created {formatDate(entry.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </Button>
              {canPause(entry.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePause}
                  disabled={processing}
                >
                  Pause
                </Button>
              )}
              {canResume(entry.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResume}
                  disabled={processing}
                >
                  Resume
                </Button>
              )}
              {canStop(entry.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStop}
                  disabled={processing}
                >
                  Stop
                </Button>
              )}
              {entry.status === "STOPPED" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleComplete}
                  disabled={processing}
                >
                  Complete
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={processing}
                className="text-error-600 hover:text-error-700 dark:text-error-400 dark:hover:text-error-300"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
          <p className="text-error-700 dark:text-error-300 text-sm break-words">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Details</h2>
            {isEditing ? (
              <TimeEntryEditForm
                entry={entry}
                onSave={handleUpdate}
                onCancel={() => setIsEditing(false)}
                isSubmitting={processing}
                userTimezone={userTimezone}
                breaks={entry.breaks || []}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Name</label>
                  <p className="mt-1 text-neutral-900 dark:text-neutral-100">{entry.name}</p>
                </div>
                {entry.description && (
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Description</label>
                    <p className="mt-1 text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{entry.description}</p>
                  </div>
                )}
                {entry.location && (
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Location</label>
                    <div className="mt-1 flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
                      <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{entry.location}</span>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status</label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(entry.status)}>{getStatusLabel(entry.status)}</Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Duration</label>
                  <div className="mt-1">
                    <DurationDisplay entry={{ ...entry, breaks: entry.breaks || [] }} className="font-mono text-lg text-neutral-900 dark:text-neutral-100" />
                  </div>
                  {entry.breaks && entry.breaks.length > 0 && (
                    <div className="mt-2 text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium block sm:inline">Breaks deducted:</span>{" "}
                      <span className="font-mono text-error-600 dark:text-error-400 block sm:inline mt-1 sm:mt-0">
                        -{formatDuration(calculateTotalBreakDuration(entry.breaks))}
                      </span>
                    </div>
                  )}
                </div>
                {entry.tags.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tags</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-sm rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {entry.ticket && (
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Ticket</label>
                    <div className="mt-1">
                      <Link
                        href={`/dashboard/tickets/${entry.ticket.id}`}
                        className="text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {entry.ticket.ticketNumber}: {entry.ticket.title}
                      </Link>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Billable</label>
                  <div className="mt-1">
                    <Badge className={entry.billable ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"}>
                      {entry.billable ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Breaks Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
            <TimeEntryBreaks
              timeEntryId={entry.id}
              userTimezone={userTimezone}
              entryTimezone={entry.timezone}
              initialBreaks={entry.breaks || []}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Timeline Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Timeline</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Timezone</label>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {entry.timezone ? (
                    <span className="font-medium">{getTimezoneLabel(entry.timezone)}</span>
                  ) : (
                    <span>{getTimezoneLabel(userTimezone)}</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Started</label>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.startedAt)}</p>
              </div>
              {entry.pausedAt && (
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Paused</label>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.pausedAt)}</p>
                </div>
              )}
              {entry.lastResumedAt && (
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Last Resumed</label>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.lastResumedAt)}</p>
                </div>
              )}
              {entry.stoppedAt && (
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Stopped</label>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.stoppedAt)}</p>
                </div>
              )}
              {entry.completedAt && (
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Completed</label>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.completedAt)}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Last Updated</label>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{formatDate(entry.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* User Info Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">User</h2>
            <div>
              <p className="text-sm text-neutral-900 dark:text-neutral-100">{entry.user.name || entry.user.email}</p>
              {entry.user.name && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{entry.user.email}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
