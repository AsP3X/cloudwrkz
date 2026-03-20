import React from "react";
import { Button } from "@/components/ui/Button";
import { formatDuration, calculateTotalBreakDuration } from "@/lib/utils/time-tracking";
import { formatDateTimeInTimezone } from "@/lib/utils/date";
import { api } from "@/api/client";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";

function toDateParts(date: Date): { day: string; month: string; year: string } {
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
}

function toTimePart(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function fromDateAndTime(day: string, month: string, year: string, hour: string, minute: string): Date | null {
  if (!day || !month || !year || !hour || !minute) return null;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}`);
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day) ||
    parsed.getHours() !== Number(hour) ||
    parsed.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function handleNumericArrowKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  min: number,
  max: number,
  padTo = 2
) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const current = Number(e.currentTarget.value || min);
  const delta = e.key === "ArrowUp" ? 1 : -1;
  let next = current + delta;
  if (next > max) next = min;
  if (next < min) next = max;
  e.currentTarget.value = String(next).padStart(padTo, "0");
}

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
  entryStartedAt?: Date;
}

const EMPTY_BREAKS: Break[] = [];

export function TimeEntryBreaks({ timeEntryId, userTimezone, entryTimezone, initialBreaks = EMPTY_BREAKS, entryStartedAt }: TimeEntryBreaksProps) {
  const displayTimezone = React.useMemo(() => {
    return entryTimezone || userTimezone || "UTC";
  }, [entryTimezone, userTimezone]);

  const [breaks, setBreaks] = React.useState<Break[]>(initialBreaks);
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [addBreakDefaults, setAddBreakDefaults] = React.useState<{
    startDay: string;
    startMonth: string;
    startYear: string;
    startHour: string;
    startMinute: string;
    endDay: string;
    endMonth: string;
    endYear: string;
    endHour: string;
    endMinute: string;
  }>({
    startDay: "",
    startMonth: "",
    startYear: "",
    startHour: "",
    startMinute: "",
    endDay: "",
    endMonth: "",
    endYear: "",
    endHour: "",
    endMinute: "",
  });
  const [editingBreak, setEditingBreak] = React.useState<Break | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const addBreakFormRef = React.useRef<HTMLFormElement | null>(null);

  const formatDate = React.useCallback((date: Date) => {
    return formatDateTimeInTimezone(date, displayTimezone);
  }, [displayTimezone]);

  const loadBreaks = async () => {
    try {
      const res: any = await api.get(`/time-tracking/${timeEntryId}`);
      const raw = res.timeEntry?.breaks ?? [];
      setBreaks(raw.map((b: any) => ({
        id: b.id,
        startedAt: new Date(b.started_at),
        endedAt: b.ended_at ? new Date(b.ended_at) : null,
        duration: b.duration,
        description: b.description,
        createdAt: new Date(b.created_at),
        updatedAt: new Date(b.updated_at),
      })));
    } catch (err) {
      console.error("Error loading breaks:", err);
    }
  };

  React.useEffect(() => {
    loadBreaks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeEntryId]);

  React.useEffect(() => {
    setBreaks(initialBreaks);
  }, [initialBreaks]);

  const handleAddBreak = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const startedAtDay = formData.get("startedAtDay") as string;
    const startedAtMonth = formData.get("startedAtMonth") as string;
    const startedAtYear = formData.get("startedAtYear") as string;
    const startedAtHour = formData.get("startedAtHour") as string;
    const startedAtMinute = formData.get("startedAtMinute") as string;
    const endedAtDay = formData.get("endedAtDay") as string;
    const endedAtMonth = formData.get("endedAtMonth") as string;
    const endedAtYear = formData.get("endedAtYear") as string;
    const endedAtHour = formData.get("endedAtHour") as string;
    const endedAtMinute = formData.get("endedAtMinute") as string;
    const description = formData.get("description") as string;

    try {
      const startedAt =
        fromDateAndTime(startedAtDay, startedAtMonth, startedAtYear, startedAtHour, startedAtMinute) ?? new Date();
      const endedAt =
        fromDateAndTime(endedAtDay, endedAtMonth, endedAtYear, endedAtHour, endedAtMinute) ??
        new Date(startedAt.getTime() + 15 * 60 * 1000);

      await api.post(`/time-tracking/${timeEntryId}/breaks`, {
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        description: description || undefined,
      });

      form.reset();
      setShowAddDialog(false);
      await loadBreaks();
    } catch (err: any) {
      setError(err.message || "Failed to add break");
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
    const startedAtDay = formData.get("startedAtDay") as string;
    const startedAtMonth = formData.get("startedAtMonth") as string;
    const startedAtYear = formData.get("startedAtYear") as string;
    const startedAtHour = formData.get("startedAtHour") as string;
    const startedAtMinute = formData.get("startedAtMinute") as string;
    const endedAtDay = formData.get("endedAtDay") as string;
    const endedAtMonth = formData.get("endedAtMonth") as string;
    const endedAtYear = formData.get("endedAtYear") as string;
    const endedAtHour = formData.get("endedAtHour") as string;
    const endedAtMinute = formData.get("endedAtMinute") as string;
    const description = formData.get("description") as string;

    try {
      const startedAt =
        fromDateAndTime(startedAtDay, startedAtMonth, startedAtYear, startedAtHour, startedAtMinute) ?? editingBreak.startedAt;
      const endedAt =
        endedAtDay && endedAtMonth && endedAtYear && endedAtHour && endedAtMinute
          ? fromDateAndTime(endedAtDay, endedAtMonth, endedAtYear, endedAtHour, endedAtMinute)
          : null;

      await api.patch(`/time-tracking/${timeEntryId}/breaks/${editingBreak.id}`, {
        started_at: startedAt.toISOString(),
        ended_at: endedAt ? endedAt.toISOString() : null,
        description: description || undefined,
      });

      setEditingBreak(null);
      await loadBreaks();
    } catch (err: any) {
      setError(err.message || "Failed to update break");
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
      await api.delete(`/time-tracking/${timeEntryId}/breaks/${breakId}`);
      await loadBreaks();
    } catch (err: any) {
      setError(err.message || "Failed to delete break");
    } finally {
      setProcessing(false);
    }
  };

  const totalBreakDuration = calculateTotalBreakDuration(
    breaks.map((b) => ({
      started_at: b.startedAt.toISOString(),
      ended_at: b.endedAt ? b.endedAt.toISOString() : null,
      duration: b.duration,
    }))
  );

  const openAddBreakDialog = () => {
    const entryDate = entryStartedAt
      ? new Date(entryStartedAt.getFullYear(), entryStartedAt.getMonth(), entryStartedAt.getDate())
      : new Date();
    const start = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 12, 0, 0);
    const end = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate(), 12, 30, 0);
    const s = toDateParts(start);
    const e = toDateParts(end);
    setAddBreakDefaults({
      startDay: s.day,
      startMonth: s.month,
      startYear: s.year,
      startHour: toTimePart(start).split(":")[0],
      startMinute: toTimePart(start).split(":")[1],
      endDay: e.day,
      endMonth: e.month,
      endYear: e.year,
      endHour: toTimePart(end).split(":")[0],
      endMinute: toTimePart(end).split(":")[1],
    });
    setShowAddDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-warning-50 dark:bg-warning-900/30 border border-warning-200/60 dark:border-warning-700/40">
            <svg className="w-4.5 h-4.5 text-warning-600 dark:text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Breaks</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Total: <span className="font-mono font-medium text-warning-600 dark:text-warning-400">{formatDuration(totalBreakDuration)}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={openAddBreakDialog}
          disabled={processing}
          className="self-start sm:self-auto"
        >
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Break
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 animate-error-shake">
          <svg className="w-4 h-4 text-error-500 dark:text-error-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
        </div>
      )}

      {breaks.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <svg className="w-10 h-10 mx-auto text-neutral-300 dark:text-neutral-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No breaks recorded</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">Add a break to track pauses in your work</p>
        </div>
      ) : (
        <div className="space-y-2">
          {breaks.map((breakRecord, index) => {
            const isOngoing = !breakRecord.endedAt;
            const currentDuration = isOngoing
              ? Math.floor((new Date().getTime() - breakRecord.startedAt.getTime()) / 1000)
              : breakRecord.duration;

            return (
              <div
                key={breakRecord.id}
                className="group relative rounded-xl p-3.5 border border-neutral-200/80 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/40 transition-all duration-200 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-soft animate-field-in"
                style={{ "--field-delay": `${index * 50}ms` } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <span className="font-mono text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatDuration(currentDuration)}
                      </span>
                      {isOngoing && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-warning-100 dark:bg-warning-900/40 text-warning-700 dark:text-warning-300 border border-warning-200/60 dark:border-warning-700/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning-500 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>
                    <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-700 flex-shrink-0" />
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 min-w-0 truncate">
                      <span>{formatDate(breakRecord.startedAt)}</span>
                      {breakRecord.endedAt && (
                        <span className="text-neutral-400 dark:text-neutral-500"> &mdash; {formatDate(breakRecord.endedAt)}</span>
                      )}
                      {breakRecord.description && (
                        <span className="block text-neutral-600 dark:text-neutral-300 mt-0.5 truncate">{breakRecord.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setEditingBreak(breakRecord)}
                      disabled={processing}
                      className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all duration-150 active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBreak(breakRecord.id)}
                      disabled={processing}
                      className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-error-600 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/30 transition-all duration-150 active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
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
        <div className="px-5 sm:px-7 py-5">
          <form
            key={showAddDialog ? "add-break-open" : "add-break-closed"}
            ref={addBreakFormRef}
            onSubmit={handleAddBreak}
            className="space-y-4"
          >
            <div className="animate-field-in space-y-4" style={{ "--field-delay": "40ms" } as React.CSSProperties}>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Start (Tag/Monat/Jahr/Stunde/Minute)
                </label>
                <div className="inline-flex w-fit px-3 py-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-gradient-to-b from-white to-neutral-50/80 dark:from-neutral-900 dark:to-neutral-900/80 text-neutral-900 dark:text-neutral-100 items-center gap-1.5 shadow-soft hover:shadow-soft-md focus-within:border-primary-500/70 dark:focus-within:border-primary-400/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all duration-200">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">Date</span>
                  <input id="startedAtDay" name="startedAtDay" type="text" defaultValue={addBreakDefaults.startDay || "01"} required inputMode="numeric" placeholder="TT" onKeyDown={(e) => handleNumericArrowKey(e, 1, 31)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                  <input id="startedAtMonth" name="startedAtMonth" type="text" defaultValue={addBreakDefaults.startMonth || "01"} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 1, 12)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                  <input id="startedAtYear" name="startedAtYear" type="text" defaultValue={addBreakDefaults.startYear || String(new Date().getFullYear())} required inputMode="numeric" placeholder="JJJJ" onKeyDown={(e) => handleNumericArrowKey(e, 1970, 9999, 4)} className="w-12 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ml-0.5 mr-0.5">Time</span>
                  <input id="startedAtHour" name="startedAtHour" type="text" defaultValue={addBreakDefaults.startHour || "12"} required inputMode="numeric" placeholder="HH" onKeyDown={(e) => handleNumericArrowKey(e, 0, 23)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">:</span>
                  <input id="startedAtMinute" name="startedAtMinute" type="text" defaultValue={addBreakDefaults.startMinute || "00"} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 0, 59)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Ende (Tag/Monat/Jahr/Stunde/Minute)
                </label>
                <div className="inline-flex w-fit px-3 py-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-gradient-to-b from-white to-neutral-50/80 dark:from-neutral-900 dark:to-neutral-900/80 text-neutral-900 dark:text-neutral-100 items-center gap-1.5 shadow-soft hover:shadow-soft-md focus-within:border-primary-500/70 dark:focus-within:border-primary-400/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all duration-200">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">Date</span>
                  <input id="endedAtDay" name="endedAtDay" type="text" defaultValue={addBreakDefaults.endDay || "01"} required inputMode="numeric" placeholder="TT" onKeyDown={(e) => handleNumericArrowKey(e, 1, 31)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                  <input id="endedAtMonth" name="endedAtMonth" type="text" defaultValue={addBreakDefaults.endMonth || "01"} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 1, 12)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                  <input id="endedAtYear" name="endedAtYear" type="text" defaultValue={addBreakDefaults.endYear || String(new Date().getFullYear())} required inputMode="numeric" placeholder="JJJJ" onKeyDown={(e) => handleNumericArrowKey(e, 1970, 9999, 4)} className="w-12 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ml-0.5 mr-0.5">Time</span>
                  <input id="endedAtHour" name="endedAtHour" type="text" defaultValue={addBreakDefaults.endHour || "12"} required inputMode="numeric" placeholder="HH" onKeyDown={(e) => handleNumericArrowKey(e, 0, 23)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  <span className="text-neutral-400 dark:text-neutral-500 text-sm">:</span>
                  <input id="endedAtMinute" name="endedAtMinute" type="text" defaultValue={addBreakDefaults.endMinute || "30"} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 0, 59)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="animate-field-in" style={{ "--field-delay": "80ms" } as React.CSSProperties}>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Description (optional)
              </label>
              <Textarea
                id="description"
                name="description"
                rows={2}
                placeholder="e.g., Lunch break, Coffee break..."
              />
            </div>
            <div className="animate-field-in flex items-center justify-end gap-3 pt-4 border-t border-neutral-200/80 dark:border-neutral-700/60" style={{ "--field-delay": "120ms" } as React.CSSProperties}>
              <Button
                type="button"
                variant="ghost"
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
              <Button type="submit" disabled={processing} loading={processing}>
                Add Break
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Edit Break Dialog */}
      {editingBreak && (
        <Dialog
          open={!!editingBreak}
          onOpenChange={(open) => !open && setEditingBreak(null)}
          title="Edit Break"
          description="Update the break times and description"
        >
          <div className="px-5 sm:px-7 py-5">
            <form onSubmit={handleUpdateBreak} className="space-y-4">
              <div className="animate-field-in space-y-4" style={{ "--field-delay": "40ms" } as React.CSSProperties}>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Start (Tag/Monat/Jahr/Stunde/Minute)
                  </label>
                  <div className="inline-flex w-fit px-3 py-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-gradient-to-b from-white to-neutral-50/80 dark:from-neutral-900 dark:to-neutral-900/80 text-neutral-900 dark:text-neutral-100 items-center gap-1.5 shadow-soft hover:shadow-soft-md focus-within:border-primary-500/70 dark:focus-within:border-primary-400/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all duration-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">Date</span>
                    <input id="edit-startedAtDay" name="startedAtDay" type="text" defaultValue={toDateParts(editingBreak.startedAt).day} required inputMode="numeric" placeholder="TT" onKeyDown={(e) => handleNumericArrowKey(e, 1, 31)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                    <input id="edit-startedAtMonth" name="startedAtMonth" type="text" defaultValue={toDateParts(editingBreak.startedAt).month} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 1, 12)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                    <input id="edit-startedAtYear" name="startedAtYear" type="text" defaultValue={toDateParts(editingBreak.startedAt).year} required inputMode="numeric" placeholder="JJJJ" onKeyDown={(e) => handleNumericArrowKey(e, 1970, 9999, 4)} className="w-12 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ml-0.5 mr-0.5">Time</span>
                    <input id="edit-startedAtHour" name="startedAtHour" type="text" defaultValue={toTimePart(editingBreak.startedAt).split(":")[0]} required inputMode="numeric" placeholder="HH" onKeyDown={(e) => handleNumericArrowKey(e, 0, 23)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">:</span>
                    <input id="edit-startedAtMinute" name="startedAtMinute" type="text" defaultValue={toTimePart(editingBreak.startedAt).split(":")[1]} required inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 0, 59)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Ende (Tag/Monat/Jahr/Stunde/Minute)
                  </label>
                  <div className="inline-flex w-fit px-3 py-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-gradient-to-b from-white to-neutral-50/80 dark:from-neutral-900 dark:to-neutral-900/80 text-neutral-900 dark:text-neutral-100 items-center gap-1.5 shadow-soft hover:shadow-soft-md focus-within:border-primary-500/70 dark:focus-within:border-primary-400/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all duration-200">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">Date</span>
                    <input id="edit-endedAtDay" name="endedAtDay" type="text" defaultValue={editingBreak.endedAt ? toDateParts(editingBreak.endedAt).day : ""} inputMode="numeric" placeholder="TT" onKeyDown={(e) => handleNumericArrowKey(e, 1, 31)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                    <input id="edit-endedAtMonth" name="endedAtMonth" type="text" defaultValue={editingBreak.endedAt ? toDateParts(editingBreak.endedAt).month : ""} inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 1, 12)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
                    <input id="edit-endedAtYear" name="endedAtYear" type="text" defaultValue={editingBreak.endedAt ? toDateParts(editingBreak.endedAt).year : ""} inputMode="numeric" placeholder="JJJJ" onKeyDown={(e) => handleNumericArrowKey(e, 1970, 9999, 4)} className="w-12 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ml-0.5 mr-0.5">Time</span>
                    <input id="edit-endedAtHour" name="endedAtHour" type="text" defaultValue={editingBreak.endedAt ? toTimePart(editingBreak.endedAt).split(":")[0] : ""} inputMode="numeric" placeholder="HH" onKeyDown={(e) => handleNumericArrowKey(e, 0, 23)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                    <span className="text-neutral-400 dark:text-neutral-500 text-sm">:</span>
                    <input id="edit-endedAtMinute" name="endedAtMinute" type="text" defaultValue={editingBreak.endedAt ? toTimePart(editingBreak.endedAt).split(":")[1] : ""} inputMode="numeric" placeholder="MM" onKeyDown={(e) => handleNumericArrowKey(e, 0, 59)} className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none" />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">Leave end values empty for ongoing break</p>
                </div>
              </div>
              <div className="animate-field-in" style={{ "--field-delay": "80ms" } as React.CSSProperties}>
                <label htmlFor="edit-description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Description (optional)
                </label>
                <Textarea
                  id="edit-description"
                  name="description"
                  rows={2}
                  defaultValue={editingBreak.description || ""}
                  placeholder="e.g., Lunch break, Coffee break..."
                />
              </div>
              <div className="animate-field-in flex items-center justify-end gap-3 pt-4 border-t border-neutral-200/80 dark:border-neutral-700/60" style={{ "--field-delay": "120ms" } as React.CSSProperties}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingBreak(null);
                    setError(null);
                  }}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={processing} loading={processing}>
                  Update Break
                </Button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}
