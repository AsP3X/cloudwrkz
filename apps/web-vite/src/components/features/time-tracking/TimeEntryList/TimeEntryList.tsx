import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/Badge";
import { DurationDisplay } from "../DurationDisplay";
import { useTimeEntryView } from "../TimeEntryViewContext";
import {
  getStatusColor,
  getStatusLabel,
  canPause,
  canResume,
  canStop,
  formatTimerNumber,
  calculateTotalBreakDuration,
  formatDuration,
} from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import type { TimeEntry, TimeEntryStatus } from "@/lib/types";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { EditTimeEntryDialog } from "../EditTimeEntryDialog";

interface TimeEntryListProps {
  entries: TimeEntry[];
  userTimezone?: string;
  onRefresh?: () => void;
}

export function TimeEntryList({ entries, userTimezone = "UTC", onRefresh }: TimeEntryListProps) {
  const navigate = useNavigate();
  const { viewMode } = useTimeEntryView();
  const [processing, setProcessing] = React.useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [entryToDelete, setEntryToDelete] = React.useState<TimeEntry | null>(null);
  const [editingEntry, setEditingEntry] = React.useState<TimeEntry | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; entry: TimeEntry } | null>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  const formatDate = React.useCallback(
    (date: string, entryTimezone?: string | null) => {
      const tz = entryTimezone || userTimezone || "UTC";
      return formatDateTimeInTimezone(date, tz);
    },
    [userTimezone]
  );

  const allSelected = entries.length > 0 && selectedEntries.size === entries.length;
  const someSelected = selectedEntries.size > 0 && selectedEntries.size < entries.length;

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handlePause = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/pause`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleResume = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/resume`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleStop = React.useCallback(async (entryId: string) => {
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.post(`/time-tracking/${entryId}/stop`);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [onRefresh]);

  const handleDeleteClick = React.useCallback((entry: TimeEntry) => {
    setEntryToDelete(entry);
  }, []);

  const handleSingleDeleteConfirm = React.useCallback(async () => {
    if (!entryToDelete) return;
    const entryId = entryToDelete.id;
    setProcessing((prev) => new Set(prev).add(entryId));
    try {
      await api.delete(`/time-tracking/${entryId}`);
      setEntryToDelete(null);
      onRefresh?.();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [entryToDelete, onRefresh]);

  const getEntryContextMenuItems = React.useCallback(
    (entry: TimeEntry): OverviewContextMenuItem[] => {
      const items: OverviewContextMenuItem[] = [
        {
          id: "open",
          label: "Open",
          onClick: () => {
            setContextMenu(null);
            navigate(`/dashboard/time-tracking/${entry.id}`);
          },
        },
      ];
      if (canPause(entry.status)) {
        items.push({
          id: "pause",
          label: "Pause",
          onClick: () => {
            setContextMenu(null);
            handlePause(entry.id);
          },
          disabled: processing.has(entry.id) || isProcessing,
        });
      }
      if (canResume(entry.status)) {
        items.push({
          id: "resume",
          label: "Resume",
          onClick: () => {
            setContextMenu(null);
            handleResume(entry.id);
          },
          disabled: processing.has(entry.id) || isProcessing,
        });
      }
      if (canStop(entry.status)) {
        items.push({
          id: "stop",
          label: "Stop",
          onClick: () => {
            setContextMenu(null);
            handleStop(entry.id);
          },
          disabled: processing.has(entry.id) || isProcessing,
        });
      }
      items.push(
        {
          id: "edit",
          label: "Edit",
          onClick: () => {
            setContextMenu(null);
            setEditingEntry(entry);
          },
          disabled: processing.has(entry.id) || isProcessing,
          separatorAbove: canPause(entry.status) || canResume(entry.status) || canStop(entry.status),
        },
        {
          id: "delete",
          label: "Delete",
          onClick: () => {
            setContextMenu(null);
            handleDeleteClick(entry);
          },
          disabled: processing.has(entry.id) || isProcessing,
          destructive: true,
        }
      );
      return items;
    },
    [processing, isProcessing, navigate, handlePause, handleResume, handleStop, handleDeleteClick]
  );

  if (entries.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden p-8 sm:p-12 text-center">
        <svg
          className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-neutral-400 dark:text-neutral-600 mb-4"
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
        <h3 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No time entries</h3>
        <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">Get started by creating your first time entry.</p>
      </div>
    );
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEntries(new Set(entries.map((e) => e.id)));
    } else {
      setSelectedEntries(new Set());
    }
  };

  const handleSelectEntry = (entryId: string, checked: boolean) => {
    const newSelected = new Set(selectedEntries);
    if (checked) {
      newSelected.add(entryId);
    } else {
      newSelected.delete(entryId);
    }
    setSelectedEntries(newSelected);
  };

  const handleBulkStatusChange = async (status: TimeEntryStatus) => {
    if (selectedEntries.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.post("/time-tracking/bulk-update", {
        ids: Array.from(selectedEntries),
        status,
      });
      setSelectedEntries(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update time entries");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkTag = () => {
    if (selectedEntries.size === 0) return;
    // Tag dialog not yet implemented
  };

  const handleBulkDelete = () => {
    if (selectedEntries.size === 0) return;
    setShowDeleteDialog(true);
  };

  const handleBulkArchive = async () => {
    if (selectedEntries.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.post("/time-tracking/bulk-archive", {
        ids: Array.from(selectedEntries),
      });
      setSelectedEntries(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive time entries");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedEntries.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.post("/time-tracking/bulk-delete", {
        ids: Array.from(selectedEntries),
      });
      setSelectedEntries(new Set());
      setShowDeleteDialog(false);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete time entries");
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedEntries(new Set());
    setError(null);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {selectedEntries.size > 0 && (
        <>
          <div className="px-6 py-3 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                {selectedEntries.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkStatusChange("STOPPED")}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={handleBulkTag}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-800 disabled:opacity-50 transition-colors"
                >
                  Tag
                </button>
                <button
                  type="button"
                  onClick={handleBulkArchive}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 disabled:opacity-50 transition-colors"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-medium bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 rounded hover:bg-error-200 dark:hover:bg-error-800 disabled:opacity-50 transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          {error && (
            <div className="px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">{error}</p>
              </div>
            </div>
          )}
        </>
      )}
      {/* Card View */}
      {viewMode === "card" && (
      <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {entries.map((entry) => {
          const isProcessingEntry = processing.has(entry.id);
          const isSelected = selectedEntries.has(entry.id);

          const cardClassName = cn(
            "p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
            isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
          );

          return (
            <div
              key={entry.id}
              className={cardClassName}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, entry });
              }}
            >
              <div className="flex items-start gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleSelectEntry(entry.id, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 mt-1 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer flex-shrink-0"
                  aria-label={`Select ${formatTimerNumber(entry.name)}`}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/dashboard/time-tracking/${entry.id}`}
                    className="block font-semibold text-base text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 mb-1"
                  >
                    {formatTimerNumber(entry.name)}
                  </Link>
                  {entry.description && (
                    <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2 line-clamp-2">
                      {entry.description}
                    </div>
                  )}
                  {entry.ticket_id && (
                    <div className="mb-2">
                      <Link
                        to={`/dashboard/tickets/${entry.ticket_id}`}
                        className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        View ticket
                      </Link>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge className={getStatusColor(entry.status)}>{getStatusLabel(entry.status)}</Badge>
                    <DurationDisplay
                      entry={{ ...entry, breaks: entry.breaks || [] }}
                      className="font-mono text-sm text-neutral-700 dark:text-neutral-300"
                    />
                  </div>
                  {entry.breaks && entry.breaks.length > 0 && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium">Breaks deducted:</span>{" "}
                      <span className="font-mono text-error-600 dark:text-error-400">
                        -{formatDuration(calculateTotalBreakDuration(entry.breaks))}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium min-w-[80px]">Started:</span>
                  <span className="text-neutral-900 dark:text-neutral-100">{formatDate(entry.started_at, entry.timezone)}</span>
                </div>
                {entry.timezone && (
                <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                  <span className="font-medium min-w-[80px]">Timezone:</span>
                  <span className="font-mono text-xs text-neutral-900 dark:text-neutral-100">{entry.timezone}</span>
                </div>
                )}
                {entry.location && (
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <span className="font-medium min-w-[80px]">Location:</span>
                    <div className="flex items-center gap-1 text-neutral-900 dark:text-neutral-100">
                      <svg className="w-4 h-4 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">{entry.location}</span>
                    </div>
                  </div>
                )}
                {entry.tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="font-medium min-w-[80px] text-neutral-600 dark:text-neutral-400 pt-1">Tags:</span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div role="presentation" className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700" onClick={(e) => e.stopPropagation()}>
                {canPause(entry.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePause(entry.id);
                    }}
                    disabled={isProcessingEntry || isProcessing}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 disabled:opacity-50 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {canResume(entry.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResume(entry.id);
                    }}
                    disabled={isProcessingEntry || isProcessing}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 disabled:opacity-50 transition-colors"
                  >
                    Resume
                  </button>
                )}
                {canStop(entry.status) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStop(entry.id);
                    }}
                    disabled={isProcessingEntry || isProcessing}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEntry(entry);
                  }}
                  disabled={isProcessingEntry || isProcessing}
                  className="px-3 py-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"
                  title="Edit"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(entry);
                  }}
                  disabled={isProcessingEntry || isProcessing}
                  className="px-3 py-2 text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 disabled:opacity-50"
                  title="Delete"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (() => {
        const hasAnyTicket = entries.some((e) => e.ticket_id);
        const hasAnyBreaks = entries.some((e) => e.breaks && e.breaks.length > 0);
        const hasAnyLocation = entries.some((e) => e.location);
        const hasAnyTags = entries.some((e) => e.tags.length > 0);
        const hasAnyTimezone = entries.some((e) => e.timezone);

        return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                <input
                  type="checkbox"
                  ref={selectAllRef}
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                  aria-label="Select all entries"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Name
              </th>
              {hasAnyTicket && (
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                Ticket
              </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Duration
              </th>
              {hasAnyBreaks && (
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Breaks
              </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Started
              </th>
              {hasAnyTimezone && (
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                Timezone
              </th>
              )}
              {hasAnyLocation && (
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                Location
              </th>
              )}
              {hasAnyTags && (
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Tags
              </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {entries.map((entry) => {
              const isProcessingEntry = processing.has(entry.id);
              const isSelected = selectedEntries.has(entry.id);

              const rowClassName = cn(
                "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                isSelected && "bg-primary-50 dark:bg-primary-900/20"
              );

              return (
                <tr
                  key={entry.id}
                  className={rowClassName}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                >
                  <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectEntry(entry.id, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                      aria-label={`Select ${entry.name}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/dashboard/time-tracking/${entry.id}`}
                      className="font-medium text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      <div className="max-w-md">
                        <div className="truncate">{formatTimerNumber(entry.name)}</div>
                        {entry.description && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                            {entry.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  {hasAnyTicket && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm hidden md:table-cell">
                    {entry.ticket_id ? (
                      <Link
                        to={`/dashboard/tickets/${entry.ticket_id}`}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        View ticket
                      </Link>
                    ) : (
                      <span className="text-neutral-400">&mdash;</span>
                    )}
                  </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusColor(entry.status)}>{getStatusLabel(entry.status)}</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <DurationDisplay
                      entry={{ ...entry, breaks: entry.breaks || [] }}
                      className="font-mono text-sm"
                    />
                  </td>
                  {hasAnyBreaks && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
                    {entry.breaks && entry.breaks.length > 0 ? (
                      <span className="font-mono text-xs text-error-600 dark:text-error-400">
                        -{formatDuration(calculateTotalBreakDuration(entry.breaks))}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">&mdash;</span>
                    )}
                  </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400">
                    {formatDate(entry.started_at, entry.timezone)}
                  </td>
                  {hasAnyTimezone && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400 hidden lg:table-cell">
                    <span className="font-mono text-xs">{entry.timezone || userTimezone}</span>
                  </td>
                  )}
                  {hasAnyLocation && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400 hidden md:table-cell">
                    {entry.location ? (
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate max-w-[120px]">{entry.location}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">&mdash;</span>
                    )}
                  </td>
                  )}
                  {hasAnyTags && (
                  <td className="px-6 py-4">
                    {entry.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {entry.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
                          >
                            {tag}
                          </span>
                        ))}
                        {entry.tags.length > 2 && (
                          <span className="px-2 py-1 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                            +{entry.tags.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">&mdash;</span>
                    )}
                  </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {canPause(entry.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePause(entry.id);
                          }}
                          disabled={isProcessingEntry || isProcessing}
                          className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"
                          title="Pause"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}
                      {canResume(entry.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResume(entry.id);
                          }}
                          disabled={isProcessingEntry || isProcessing}
                          className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"
                          title="Resume"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      )}
                      {canStop(entry.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStop(entry.id);
                          }}
                          disabled={isProcessingEntry || isProcessing}
                          className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"
                          title="Stop"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEntry(entry);
                        }}
                        disabled={isProcessingEntry || isProcessing}
                        className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(entry);
                        }}
                        disabled={isProcessingEntry || isProcessing}
                        className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-error-600 dark:hover:text-error-400 disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        );
      })()}
      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getEntryContextMenuItems(contextMenu.entry) : []}
      />
      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Delete Time Entry</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Are you sure you want to delete &ldquo;{formatTimerNumber(entryToDelete.name)}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSingleDeleteConfirm}
                disabled={processing.has(entryToDelete.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-error-600 rounded-lg hover:bg-error-700 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Delete Time Entries</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Are you sure you want to delete {selectedEntries.size} time {selectedEntries.size === 1 ? "entry" : "entries"}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-error-600 rounded-lg hover:bg-error-700 disabled:opacity-50 transition-colors"
              >
                Delete {selectedEntries.size} {selectedEntries.size === 1 ? "Entry" : "Entries"}
              </button>
            </div>
          </div>
        </div>
      )}
      {editingEntry && (
        <EditTimeEntryDialog
          open={!!editingEntry}
          onOpenChange={(open) => {
            if (!open) setEditingEntry(null);
          }}
          entry={editingEntry}
          userTimezone={userTimezone}
          onUpdated={onRefresh}
        />
      )}
    </div>
  );
}
