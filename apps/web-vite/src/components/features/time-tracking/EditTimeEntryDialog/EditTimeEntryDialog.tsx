import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TimeEntryEditForm } from "../TimeEntryEditForm";
import { api } from "@/api/client";
import type { UpdateTimeEntryInput } from "@/lib/validations/time-tracking";
import type { TimeEntry as ViteTimeEntry } from "@/lib/types";
import { parseApiDate } from "@/lib/utils/date";

// Human: React UI for `EditTimeEntryDialog` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS EditTimeEntryDialog; REACT component; READS props hooks; MAY CALL api client.
interface EditTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ViteTimeEntry;
  userTimezone?: string;
  onUpdated?: () => void;
}

export function EditTimeEntryDialog({ open, onOpenChange, entry, userTimezone = "UTC", onUpdated }: EditTimeEntryDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const formEntry = React.useMemo(() => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    status: entry.status,
    tags: entry.tags,
    billable: entry.billable,
    location: entry.location,
    timezone: entry.timezone,
    startedAt: parseApiDate(entry.started_at),
    stoppedAt: entry.stopped_at ? parseApiDate(entry.stopped_at) : null,
    ticket: entry.ticket_id ? { id: entry.ticket_id, ticketNumber: "", title: "" } : null,
  }), [entry]);

  const formBreaks = React.useMemo(() =>
    (entry.breaks ?? []).map((b) => ({
      id: b.id,
      startedAt: parseApiDate(b.started_at),
      endedAt: b.ended_at ? parseApiDate(b.ended_at) : null,
      duration: b.duration,
      description: b.description,
      createdAt: new Date(b.created_at),
      updatedAt: new Date(b.updated_at),
    })),
    [entry.breaks]
  );

  const handleSave = async (data: UpdateTimeEntryInput) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.patch(`/time-tracking/${entry.id}`, {
        name: data.name,
        description: data.description,
        tags: data.tags,
        billable: data.billable,
        location: data.location || null,
        timezone: data.timezone === "" ? null : (data.timezone ?? null),
        started_at: data.startedAt ? data.startedAt.toISOString() : undefined,
        stopped_at: data.stoppedAt ? data.stoppedAt.toISOString() : null,
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (err: any) {
      setError(err.message || "Failed to update time entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Time Entry"
      description="Update the details, schedule, and breaks for this entry"
    >
      <div className="px-5 sm:px-7 py-5">
        {error && (
          <div className="mb-5 flex items-start gap-3 p-4 rounded-xl bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 animate-error-shake">
            <svg className="w-5 h-5 text-error-500 dark:text-error-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
          </div>
        )}
        <TimeEntryEditForm
          entry={formEntry}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          userTimezone={userTimezone}
          entryTimezone={entry.timezone}
          breaks={formBreaks}
        />
      </div>
    </Dialog>
  );
}
