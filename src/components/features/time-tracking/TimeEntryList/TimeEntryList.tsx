"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DurationDisplay } from "../DurationDisplay";
import { TimeEntryBulkActionsToolbar } from "../TimeEntryBulkActionsToolbar";
import { TimeEntryBulkDeleteDialog } from "../TimeEntryBulkDeleteDialog";
import { TimeEntryBulkTagDialog } from "../TimeEntryBulkTagDialog";
import { getStatusColor, getStatusLabel, canPause, canResume, canStop } from "@/lib/utils/time-tracking";
import { cn } from "@/lib/utils/cn";
import { pauseTimeEntry, resumeTimeEntry, stopTimeEntry, deleteTimeEntry, bulkUpdateTimeEntries, bulkDeleteTimeEntries } from "@/server/actions/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";
import { EditTimeEntryDialog } from "../EditTimeEntryDialog";

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
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
};

interface TimeEntryListProps {
  entries: TimeEntry[];
}

export function TimeEntryList({ entries }: TimeEntryListProps) {
  const router = useRouter();
  const [processing, setProcessing] = React.useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showTagDialog, setShowTagDialog] = React.useState(false);
  const [editingEntry, setEditingEntry] = React.useState<TimeEntry | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const allSelected = entries.length > 0 && selectedEntries.size === entries.length;
  const someSelected = selectedEntries.size > 0 && selectedEntries.size < entries.length;

  // Set indeterminate state on select all checkbox
  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Get all unique tags from selected entries (must be before early return)
  const selectedTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    entries
      .filter((e) => selectedEntries.has(e.id))
      .forEach((e) => {
        e.tags.forEach((tag) => tagSet.add(tag));
      });
    return Array.from(tagSet);
  }, [entries, selectedEntries]);

  // Early return after all hooks
  if (entries.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <svg
          className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-600 mb-4"
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
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No time entries</h3>
        <p className="text-neutral-600 dark:text-neutral-400">Get started by creating your first time entry.</p>
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
      const result = await bulkUpdateTimeEntries(Array.from(selectedEntries), { status });
      if (result.success) {
        setSelectedEntries(new Set());
        router.refresh();
      } else {
        setError(result.error || "Failed to update time entries");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkTag = () => {
    if (selectedEntries.size === 0) return;
    setShowTagDialog(true);
  };

  const handleBulkTagConfirm = async (tags: string[]) => {
    if (selectedEntries.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkUpdateTimeEntries(Array.from(selectedEntries), { tags });
      if (result.success) {
        setSelectedEntries(new Set());
        setShowTagDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update tags");
        setShowTagDialog(false);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setShowTagDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedEntries.size === 0) return;
    setShowDeleteDialog(true);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedEntries.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkDeleteTimeEntries(Array.from(selectedEntries));
      if (result.success) {
        setSelectedEntries(new Set());
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to delete time entries");
        setShowDeleteDialog(false);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedEntries(new Set());
    setError(null);
  };

  const handleAction = async (id: string, action: () => Promise<any>) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const result = await action();
      if (result.success) {
        router.refresh();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {selectedEntries.size > 0 && (
        <>
          <TimeEntryBulkActionsToolbar
            selectedCount={selectedEntries.size}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkTag={handleBulkTag}
            onBulkDelete={handleBulkDelete}
            onClearSelection={handleClearSelection}
          />
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
                <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
              </div>
            </div>
          )}
        </>
      )}
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
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Started
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {entries.map((entry) => {
              const isProcessingEntry = processing.has(entry.id);
              // Only check selection state after mount to avoid hydration mismatch
              const isSelected = mounted && selectedEntries.has(entry.id);
              
              // Base classes that should always be present (same on server and client)
              // Using cn to ensure proper class merging
              const rowClassName = cn(
                "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
                isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
              );

              return (
                <tr
                  key={entry.id}
                  className={rowClassName}
                >
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectEntry(entry.id, e.target.checked);
                      }}
                      className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                      aria-label={`Select ${entry.name}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link 
                      href={`/dashboard/time-tracking/${entry.id}`}
                      className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {entry.name}
                    </Link>
                    {entry.description && (
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        {entry.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={getStatusColor(entry.status)}>{getStatusLabel(entry.status)}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <DurationDisplay entry={entry} className="font-mono text-sm" />
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {formatDate(entry.startedAt)}
                  </td>
                  <td className="px-6 py-4">
                    {entry.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {canPause(entry.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(entry.id, () => pauseTimeEntry(entry.id));
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
                            handleAction(entry.id, () => resumeTimeEntry(entry.id));
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
                            handleAction(entry.id, () => stopTimeEntry(entry.id));
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
                          if (confirm("Are you sure you want to delete this time entry?")) {
                            handleAction(entry.id, () => deleteTimeEntry(entry.id));
                          }
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
      {showDeleteDialog && (
        <TimeEntryBulkDeleteDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleBulkDeleteConfirm}
          selectedCount={selectedEntries.size}
        />
      )}
      {showTagDialog && (
        <TimeEntryBulkTagDialog
          open={showTagDialog}
          onOpenChange={setShowTagDialog}
          onConfirm={handleBulkTagConfirm}
          selectedCount={selectedEntries.size}
          existingTags={selectedTags}
        />
      )}
      {editingEntry && (
        <EditTimeEntryDialog
          open={!!editingEntry}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEntry(null);
            }
          }}
          entry={editingEntry}
        />
      )}
    </div>
  );
}
