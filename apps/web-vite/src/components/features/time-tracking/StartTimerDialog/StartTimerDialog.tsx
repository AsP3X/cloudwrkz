import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/api/client";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";
import { TimeEntryTagsField } from "../TimeEntryTagsDialog";
import { DateTimeFields } from "@/components/ui/DateTimeFields";
import { useAuth } from "@/components/providers/AuthProvider";
import { canUseCustomerBillingOnTimeEntries } from "@/lib/time-entry-customers";
import {
  TimeEntryBillingField,
  type TimeEntryBillingState,
} from "../TimeEntryBillingDialog";
import { hourlyRateForCreatePayload } from "@/lib/utils/time-tracking";

// Human: React UI for `StartTimerDialog` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS StartTimerDialog; REACT component; READS props hooks; MAY CALL api client.
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1">
      <span className="text-primary-500 dark:text-primary-400">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</span>
      <div className="flex-1 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
    </div>
  );
}

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function StartTimerDialog({ open, onOpenChange, onCreated }: StartTimerDialogProps) {
  const { modules, can } = useAuth();
  const customersModuleEnabled = canUseCustomerBillingOnTimeEntries(modules, can);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [billing, setBilling] = React.useState<TimeEntryBillingState>({
    customerId: null,
    customerContactId: null,
    customerDisplayName: null,
    hourlyRate: null,
  });

  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLocation("");
      setStartedAt(null);
      setTags([]);
      setBilling({ customerId: null, customerContactId: null, customerDisplayName: null, hourlyRate: null });
      setServerError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setStartedAt(new Date());
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    try {
      await api.post("/time-tracking", {
        name: name.trim() || undefined,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
        location: location.trim() || undefined,
        started_at: startedAt?.toISOString(),
        customer_id: billing.customerId ?? undefined,
        customer_contact_id: billing.customerContactId ?? undefined,
        hourly_rate: hourlyRateForCreatePayload(billing.hourlyRate),
      });
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      setServerError(error.message || "Failed to start timer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      description="Create a new time tracking entry"
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
              placeholder="Enter timer name (optional)"
              helperText="Leave empty to auto-generate (e.g., #TMR-000001)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "80ms" } as React.CSSProperties}>
            <Textarea
              label="Description"
              placeholder="What will you be working on?"
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

          <div className="animate-field-in" style={{ "--field-delay": "160ms" } as React.CSSProperties}>
            <DateTimeFields
              label="Start Time"
              value={startedAt}
              onChange={setStartedAt}
              required
              idPrefix="start-timer-started-at"
            />
          </div>
        </div>

        {/* Organization Section */}
        <div className="space-y-4">
          <div className="animate-field-in" style={{ "--field-delay": "200ms" } as React.CSSProperties}>
            <SectionHeader
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>}
              label="Organization"
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "240ms" } as React.CSSProperties}>
            <LocationAutocompleteInput
              label="Location"
              placeholder="Where are you working?"
              value={location}
              onChange={setLocation}
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "260ms" } as React.CSSProperties}>
            <TimeEntryBillingField
              billing={billing}
              onChange={setBilling}
              customersModuleEnabled={customersModuleEnabled}
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "280ms" } as React.CSSProperties}>
            <TimeEntryTagsField tags={tags} onChange={setTags} disabled={isSubmitting} />
          </div>
        </div>

        {/* Footer */}
        <div className="animate-field-in flex items-center justify-end gap-3 pt-5 border-t border-neutral-200/80 dark:border-neutral-700/60" style={{ "--field-delay": "320ms" } as React.CSSProperties}>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Start Timer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
