import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/api/client";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";
import { TagAutocompleteInput } from "@/components/ui/TagAutocompleteInput";
import { DateTimeFields } from "@/components/ui/DateTimeFields";
import { useAuth } from "@/components/providers/AuthProvider";
import { canUseCustomerBillingOnTimeEntries } from "@/lib/time-entry-customers";
import {
  clearAddTimeEntryDraft,
  formatDraftSavedAt,
  loadAddTimeEntryDraft,
  saveAddTimeEntryDraft,
  type AddTimeEntryFormDraft,
} from "@/lib/time-entry-form-draft";
import {
  TimeEntryBillingField,
  type TimeEntryBillingState,
} from "../TimeEntryBillingDialog";

// Human: React UI for `AddTimeEntryDialog` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS AddTimeEntryDialog; REACT component; READS props hooks; MAY CALL api client.
interface AddTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const EMPTY_BILLING: TimeEntryBillingState = {
  customerId: null,
  customerContactId: null,
  customerDisplayName: null,
  hourlyRate: null,
};

const DRAFT_SAVE_DELAY_MS = 400;

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1">
      <span className="text-primary-500 dark:text-primary-400">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</span>
      <div className="flex-1 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
    </div>
  );
}

function applyDefaultSchedule(setStartedAt: (d: Date) => void, setStoppedAt: (d: Date) => void) {
  const now = new Date();
  setStartedAt(now);
  setStoppedAt(new Date(now.getTime() + 60 * 60 * 1000));
}

function applyAddDraft(
  draft: AddTimeEntryFormDraft,
  setters: {
    setName: (v: string) => void;
    setDescription: (v: string) => void;
    setLocation: (v: string) => void;
    setStartedAt: (v: Date | null) => void;
    setStoppedAt: (v: Date | null) => void;
    setTags: (v: string[]) => void;
    setBilling: (v: TimeEntryBillingState) => void;
  },
) {
  setters.setName(draft.name);
  setters.setDescription(draft.description);
  setters.setLocation(draft.location);
  setters.setStartedAt(draft.startedAt ? new Date(draft.startedAt) : null);
  setters.setStoppedAt(draft.stoppedAt ? new Date(draft.stoppedAt) : null);
  setters.setTags(draft.tags);
  setters.setBilling(draft.billing);
}

export function AddTimeEntryDialog({ open, onOpenChange, onCreated }: AddTimeEntryDialogProps) {
  const { modules, can } = useAuth();
  const customersModuleEnabled = canUseCustomerBillingOnTimeEntries(modules, can);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const [stoppedAt, setStoppedAt] = React.useState<Date | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [billing, setBilling] = React.useState<TimeEntryBillingState>(EMPTY_BILLING);
  const [restorePromptDraft, setRestorePromptDraft] = React.useState<AddTimeEntryFormDraft | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = React.useState(false);
  const restoreResolvedRef = React.useRef(false);
  const draftSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const formSetters = React.useMemo(
    () => ({
      setName,
      setDescription,
      setLocation,
      setStartedAt,
      setStoppedAt,
      setTags,
      setBilling,
    }),
    [],
  );

  // Human: On open, offer a stored draft via nested dialog; otherwise seed default start/end times.
  // Agent: READS loadAddTimeEntryDraft when open; SETS restore prompt OR applyDefaultSchedule; SKIPS until restoreResolvedRef true.
  React.useEffect(() => {
    if (!open) {
      restoreResolvedRef.current = false;
      setShowRestorePrompt(false);
      setRestorePromptDraft(null);
      return;
    }

    if (restoreResolvedRef.current) return;

    const stored = loadAddTimeEntryDraft();
    if (stored) {
      setRestorePromptDraft(stored);
      setShowRestorePrompt(true);
      return;
    }

    restoreResolvedRef.current = true;
    if (!startedAt && !stoppedAt) {
      applyDefaultSchedule(setStartedAt, setStoppedAt);
    }
  }, [open, startedAt, stoppedAt]);

  // Human: Reset visible fields when the dialog closes so the next open starts from draft prompt or defaults.
  // Agent: CLEARS local form state when open=false; DOES NOT clear localStorage draft.
  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLocation("");
      setStartedAt(null);
      setStoppedAt(null);
      setTags([]);
      setTagInput("");
      setBilling(EMPTY_BILLING);
      setServerError(null);
    }
  }, [open]);

  // Human: Debounce writes to localStorage while the user edits so reload/cancel can recover work.
  // Agent: WRITES saveAddTimeEntryDraft after DRAFT_SAVE_DELAY_MS when open and restore resolved.
  React.useEffect(() => {
    if (!open || !restoreResolvedRef.current || showRestorePrompt) return;

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      saveAddTimeEntryDraft({
        name,
        description,
        location,
        startedAt: startedAt?.toISOString() ?? null,
        stoppedAt: stoppedAt?.toISOString() ?? null,
        tags,
        billing,
      });
    }, DRAFT_SAVE_DELAY_MS);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [open, showRestorePrompt, name, description, location, startedAt, stoppedAt, tags, billing]);

  const handleAcceptRestore = () => {
    if (restorePromptDraft) {
      applyAddDraft(restorePromptDraft, formSetters);
    }
    restoreResolvedRef.current = true;
    setShowRestorePrompt(false);
    setRestorePromptDraft(null);
  };

  const handleDeclineRestore = () => {
    clearAddTimeEntryDraft();
    restoreResolvedRef.current = true;
    setShowRestorePrompt(false);
    setRestorePromptDraft(null);
    applyDefaultSchedule(setStartedAt, setStoppedAt);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    try {
      const start = startedAt;
      const stop = stoppedAt;

      if (!start || !stop) {
        setServerError("Start and end date/time are required.");
        setIsSubmitting(false);
        return;
      }

      const totalSeconds = Math.floor((stop.getTime() - start.getTime()) / 1000);
      if (totalSeconds < 0) {
        setServerError("End date/time must be after start date/time.");
        setIsSubmitting(false);
        return;
      }

      await api.post("/time-tracking/add", {
        name: name.trim() || undefined,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
        location: location.trim() || undefined,
        total_duration: totalSeconds,
        started_at: start.toISOString(),
        stopped_at: stop.toISOString(),
        customer_id: billing.customerId ?? undefined,
        customer_contact_id: billing.customerContactId ?? undefined,
        hourly_rate: billing.hourlyRate ?? undefined,
      });
      clearAddTimeEntryDraft();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      setServerError(error.message || "Failed to add time entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        closeOnOutsideClick={false}
        title="Add Time Entry"
        description="Manually add a completed time entry"
      >
        <form onSubmit={onSubmit} className="px-5 sm:px-7 py-5 space-y-6">
          {serverError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 animate-error-shake">
              <svg className="w-5 h-5 text-error-500 dark:text-error-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-error-700 dark:text-error-300">{serverError}</p>
            </div>
          )}

          {/* Details Section */}
          <div className="space-y-4">
            <div className="animate-field-in" style={{ "--field-delay": "0ms" } as React.CSSProperties}>
              <SectionHeader
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>}
                label="Details"
              />
            </div>

            <div className="animate-field-in" style={{ "--field-delay": "40ms" } as React.CSSProperties}>
              <Input
                label="Name"
                placeholder="Enter entry name (optional)"
                helperText="Leave empty to auto-generate (e.g., #TMR-000001)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="animate-field-in" style={{ "--field-delay": "80ms" } as React.CSSProperties}>
              <Textarea
                label="Description"
                placeholder="What were you working on?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Schedule Section */}
          <div className="space-y-4">
            <div className="animate-field-in" style={{ "--field-delay": "120ms" } as React.CSSProperties}>
              <SectionHeader
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                label="Schedule"
              />
            </div>

            <div className="animate-field-in grid grid-cols-2 gap-3" style={{ "--field-delay": "160ms" } as React.CSSProperties}>
              <DateTimeFields
                label="Start Time"
                value={startedAt}
                onChange={setStartedAt}
                required
                idPrefix="add-time-entry-started-at"
              />
              <DateTimeFields
                label="End Time"
                value={stoppedAt}
                onChange={setStoppedAt}
                required
                idPrefix="add-time-entry-stopped-at"
              />
            </div>
          </div>

          {/* Organization Section */}
          <div className="space-y-4">
            <div className="animate-field-in" style={{ "--field-delay": "240ms" } as React.CSSProperties}>
              <SectionHeader
                icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>}
                label="Organization"
              />
            </div>

            <div className="animate-field-in" style={{ "--field-delay": "280ms" } as React.CSSProperties}>
              <LocationAutocompleteInput
                label="Location"
                placeholder="Where were you working?"
                value={location}
                onChange={setLocation}
              />
            </div>

            <div className="animate-field-in" style={{ "--field-delay": "300ms" } as React.CSSProperties}>
              <TimeEntryBillingField
                billing={billing}
                onChange={setBilling}
                customersModuleEnabled={customersModuleEnabled}
              />
            </div>

            <div className="animate-field-in" style={{ "--field-delay": "320ms" } as React.CSSProperties}>
              <label htmlFor="add-time-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Tags
              </label>
              <div className="flex gap-2 mb-2">
                <TagAutocompleteInput
                  id="add-time-tags"
                  value={tagInput}
                  selectedTags={tags}
                  onChange={setTagInput}
                  onSubmitTag={handleAddTag}
                  placeholder="Type a tag and press Enter"
                />
                <Button type="button" variant="outline" onClick={handleAddTag} className="flex-shrink-0">
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="animate-tag-pop inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-700/40 transition-all duration-200 hover:bg-primary-100 dark:hover:bg-primary-900/60"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 p-0.5 rounded hover:bg-primary-200/60 dark:hover:bg-primary-800/60 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="animate-field-in flex items-center justify-end gap-3 pt-5 border-t border-neutral-200/80 dark:border-neutral-700/60" style={{ "--field-delay": "360ms" } as React.CSSProperties}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || showRestorePrompt} loading={isSubmitting}>
              Add Entry
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        nested
        open={open && showRestorePrompt}
        closeOnOutsideClick={false}
        closeOnEscape={false}
        title="Restore unsaved entry?"
        description={
          restorePromptDraft
            ? `You have unsaved work from ${formatDraftSavedAt(restorePromptDraft.savedAt)}.`
            : "You have unsaved work from a previous session."
        }
      >
        <div className="px-5 sm:px-7 py-5 space-y-5">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Would you like to fill the form with your previously entered details?
          </p>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-200/80 dark:border-neutral-700/60">
            <Button type="button" variant="ghost" onClick={handleDeclineRestore}>
              Start fresh
            </Button>
            <Button type="button" onClick={handleAcceptRestore}>
              Restore
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
