"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { formatDuration, calculateTotalBreakDuration } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { addBreakToTimeEntry, updateBreak, deleteBreak, getBreaksForTimeEntry } from "@/server/actions/time-tracking";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils/cn";

type Break = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  duration: number;
  description: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

interface TimeEntryBreaksProps {
  timeEntryId: string;
  userTimezone: string;
  entryTimezone?: string | null;
  initialBreaks?: Break[];
}

export function TimeEntryBreaks({ timeEntryId, userTimezone, entryTimezone, initialBreaks = [] }: TimeEntryBreaksProps) {
  // Use entry timezone if set, otherwise fall back to user timezone
  const displayTimezone = React.useMemo(() => {
    return entryTimezone || userTimezone || "UTC";
  }, [entryTimezone, userTimezone]);
  
  const [breaks, setBreaks] = React.useState<Break[]>(initialBreaks);
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [editingBreak, setEditingBreak] = React.useState<Break | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const addBreakFormRef = React.useRef<HTMLFormElement | null>(null);

  const formatDate = React.useCallback((date: Date) => {
    return formatDateTimeInTimezone(date, displayTimezone);
  }, [displayTimezone]);

  const loadBreaks = async () => {
    try {
      const loadedBreaks = await getBreaksForTimeEntry(timeEntryId);
      setBreaks(loadedBreaks as Break[]);
    } catch (error) {
      console.error("Error loading breaks:", error);
    }
  };

  React.useEffect(() => {
    loadBreaks();
  }, [timeEntryId]);

  // Update breaks when initialBreaks prop changes (after timezone update)
  React.useEffect(() => {
    setBreaks(initialBreaks);
  }, [initialBreaks]);

  const handleAddBreak = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const startedAtStr = formData.get("startedAt") as string;
    const endedAtStr = formData.get("endedAt") as string;
    const description = formData.get("description") as string;

    try {
      const startedAt = startedAtStr ? new Date(startedAtStr) : new Date();
      const endedAt = endedAtStr ? new Date(endedAtStr) : undefined;

      const result = await addBreakToTimeEntry(timeEntryId, {
        startedAt,
        endedAt,
        description: description || undefined,
      });

      if (result.success) {
        // Reset form before closing dialog to avoid null reference
        form.reset();
        setShowAddDialog(false);
        await loadBreaks();
      } else {
        setError(result.error || "Failed to add break");
      }
    } catch (error: any) {
      setError(error.message || "Failed to add break");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateBreak = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingBreak) return;

    setProcessing(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const startedAtStr = formData.get("startedAt") as string;
    const endedAtStr = formData.get("endedAt") as string;
    const description = formData.get("description") as string;

    try {
      const startedAt = startedAtStr ? new Date(startedAtStr) : editingBreak.startedAt;
      const endedAt = endedAtStr === "" ? null : endedAtStr ? new Date(endedAtStr) : editingBreak.endedAt;

      const result = await updateBreak(editingBreak.id, {
        startedAt,
        endedAt,
        description: description || undefined,
      });

      if (result.success) {
        setEditingBreak(null);
        await loadBreaks();
      } else {
        setError(result.error || "Failed to update break");
      }
    } catch (error: any) {
      setError(error.message || "Failed to update break");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteBreak = async (breakId: string) => {
    if (!confirm("Are you sure you want to delete this break?")) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const result = await deleteBreak(breakId);
      if (result.success) {
        await loadBreaks();
      } else {
        setError(result.error || "Failed to delete break");
      }
    } catch (error: any) {
      setError(error.message || "Failed to delete break");
    } finally {
      setProcessing(false);
    }
  };

  const totalBreakDuration = calculateTotalBreakDuration(breaks);

  // Format datetime-local input value
  const formatDateTimeLocal = (date: Date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Breaks</h3>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            <span className="font-medium">Total break time:</span>{" "}
            <span className="font-mono text-error-600 dark:text-error-400">
              {formatDuration(totalBreakDuration)}
            </span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          disabled={processing}
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Break
        </Button>
      </div>

      {error && (
        <div className="bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg p-4">
          <p className="text-error-700 dark:text-error-300 text-sm">{error}</p>
        </div>
      )}

      {breaks.length === 0 ? (
        <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
          <p>No breaks recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {breaks.map((breakRecord) => {
            const isOngoing = !breakRecord.endedAt;
            const currentDuration = isOngoing
              ? Math.floor((new Date().getTime() - breakRecord.startedAt.getTime()) / 1000)
              : breakRecord.duration;

            return (
              <div
                key={breakRecord.id}
                className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {formatDuration(currentDuration)}
                      </span>
                      {isOngoing && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300">
                          Ongoing
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
                      <div>
                        <span className="font-medium">Started:</span> {formatDate(breakRecord.startedAt)}
                      </div>
                      {breakRecord.endedAt ? (
                        <div>
                          <span className="font-medium">Ended:</span> {formatDate(breakRecord.endedAt)}
                        </div>
                      ) : (
                        <div className="text-yellow-600 dark:text-yellow-400">
                          <span className="font-medium">Status:</span> Ongoing
                        </div>
                      )}
                      {breakRecord.description && (
                        <div>
                          <span className="font-medium">Note:</span> {breakRecord.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingBreak(breakRecord)}
                      disabled={processing}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteBreak(breakRecord.id)}
                      disabled={processing}
                      className="text-error-600 hover:text-error-700 dark:text-error-400 dark:hover:text-error-300"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Break Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setError(null);
          }
        }}
        title="Add Break"
        description="Record a break that will be deducted from the total duration"
      >
        <form 
          ref={addBreakFormRef}
          onSubmit={handleAddBreak} 
          className="space-y-4"
        >
          <div>
            <label htmlFor="startedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Start Time
            </label>
            <Input
              id="startedAt"
              name="startedAt"
              type="datetime-local"
              defaultValue={formatDateTimeLocal(new Date())}
              required
            />
          </div>
          <div>
            <label htmlFor="endedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              End Time (optional - leave empty for ongoing break)
            </label>
            <Input
              id="endedAt"
              name="endedAt"
              type="datetime-local"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Description (optional)
            </label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="e.g., Lunch break, Coffee break..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (addBreakFormRef.current) {
                  addBreakFormRef.current.reset();
                }
                setShowAddDialog(false);
                setError(null);
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={processing}>
              Add Break
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Break Dialog */}
      {editingBreak && (
        <Dialog
          open={!!editingBreak}
          onOpenChange={(open) => !open && setEditingBreak(null)}
          title="Edit Break"
          description="Update break details"
        >
          <form onSubmit={handleUpdateBreak} className="space-y-4">
            <div>
              <label htmlFor="edit-startedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Start Time
              </label>
              <Input
                id="edit-startedAt"
                name="startedAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocal(editingBreak.startedAt)}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-endedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                End Time (leave empty for ongoing break)
              </label>
              <Input
                id="edit-endedAt"
                name="endedAt"
                type="datetime-local"
                defaultValue={editingBreak.endedAt ? formatDateTimeLocal(editingBreak.endedAt) : ""}
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Description (optional)
              </label>
              <Textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={editingBreak.description || ""}
                placeholder="e.g., Lunch break, Coffee break..."
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingBreak(null);
                  setError(null);
                }}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={processing}>
                Update Break
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
