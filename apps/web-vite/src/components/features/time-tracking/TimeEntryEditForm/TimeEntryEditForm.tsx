import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DateTimeFields } from "@/components/ui/DateTimeFields";
import { updateTimeEntrySchema, type UpdateTimeEntryInput } from "@/lib/validations/time-tracking";
import { TimeEntryBreaks } from "../TimeEntryBreaks";
import { COMMON_TIMEZONES } from "@/lib/constants/timezones";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";

type TimeEntry = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tags: string[];
  billable: boolean;
  location: string | null;
  timezone: string | null;
  startedAt: Date;
  stoppedAt: Date | null;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
};

interface TimeEntryEditFormProps {
  entry: TimeEntry;
  onSave: (data: UpdateTimeEntryInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  userTimezone: string;
  entryTimezone?: string | null;
  breaks?: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    duration: number;
    description: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
}

const EMPTY_BREAKS: NonNullable<TimeEntryEditFormProps['breaks']> = [];

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1">
      <span className="text-primary-500 dark:text-primary-400">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</span>
      <div className="flex-1 h-px bg-neutral-200/60 dark:bg-neutral-700/60" />
    </div>
  );
}

export function TimeEntryEditForm({ entry, onSave, onCancel, isSubmitting, userTimezone, entryTimezone, breaks = EMPTY_BREAKS }: TimeEntryEditFormProps) {
  const [tags, setTags] = React.useState<string[]>(entry.tags);
  const [tagInput, setTagInput] = React.useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UpdateTimeEntryInput>({
    resolver: zodResolver(updateTimeEntrySchema),
    defaultValues: {
      name: entry.name,
      description: entry.description || "",
      tags: entry.tags,
      billable: entry.billable,
      location: entry.location || "",
      timezone: entry.timezone || "",
      startedAt: entry.startedAt,
      stoppedAt: entry.stoppedAt ?? undefined,
    },
  });

  React.useEffect(() => {
    reset({
      name: entry.name,
      description: entry.description || "",
      tags: entry.tags,
      billable: entry.billable,
      location: entry.location || "",
      timezone: entry.timezone || "",
      startedAt: entry.startedAt,
      stoppedAt: entry.stoppedAt ?? undefined,
    });
    setTags(entry.tags);
  }, [entry.id, entry.name, entry.description, entry.tags, entry.billable, entry.location, entry.timezone, entry.startedAt, entry.stoppedAt, reset]);

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

  const onSubmit = async (data: UpdateTimeEntryInput) => {
    await onSave({ ...data, tags });
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              label="Name *"
              id="name"
              {...register("name")}
              error={errors.name?.message}
              placeholder="Timer name"
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "80ms" } as React.CSSProperties}>
            <Textarea
              label="Description"
              id="description"
              {...register("description")}
              error={errors.description?.message}
              placeholder="What were you working on?"
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

          <div className="animate-field-in grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ "--field-delay": "160ms" } as React.CSSProperties}>
            <Controller
              name="startedAt"
              control={control}
              render={({ field }) => (
                <DateTimeFields
                  label="Start"
                  value={field.value ? new Date(field.value) : null}
                  onChange={(date) => field.onChange(date ?? undefined)}
                  error={errors.startedAt?.message}
                  idPrefix="time-entry-edit-started-at"
                />
              )}
            />

            <Controller
              name="stoppedAt"
              control={control}
              render={({ field }) => (
                <DateTimeFields
                  label="End"
                  value={field.value ? new Date(field.value) : null}
                  onChange={(date) => field.onChange(date ?? undefined)}
                  error={errors.stoppedAt?.message}
                  idPrefix="time-entry-edit-stopped-at"
                />
              )}
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "200ms" } as React.CSSProperties}>
            <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Timezone
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Override the default timezone ({userTimezone || "UTC"}) for this entry.
            </p>
            <Controller
              name="timezone"
              control={control}
              render={({ field }) => (
                <Select
                  id="timezone"
                  value={field.value || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    field.onChange(value === "" ? null : value);
                  }}
                  options={[
                    { value: "", label: `Use user timezone (${userTimezone || "UTC"})` },
                    ...COMMON_TIMEZONES.map((tz) => ({
                      value: tz.value,
                      label: tz.label,
                    })),
                  ]}
                />
              )}
            />
            {errors.timezone && (
              <p className="mt-1 text-xs text-error-600 dark:text-error-400">{errors.timezone.message}</p>
            )}
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
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <LocationAutocompleteInput
                  label="Location"
                  id="location"
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val)}
                  error={errors.location?.message}
                  placeholder="Where were you working?"
                />
              )}
            />
          </div>

          <div className="animate-field-in" style={{ "--field-delay": "320ms" } as React.CSSProperties}>
            <label htmlFor="time-entry-edit-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Tags
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                id="time-entry-edit-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Type a tag and press Enter"
                className="flex-1"
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

          <div className="animate-field-in" style={{ "--field-delay": "360ms" } as React.CSSProperties}>
            <label className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30 cursor-pointer transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/30 dark:hover:bg-primary-900/10">
              <div className="relative">
                <input
                  type="checkbox"
                  {...register("billable")}
                  className="peer sr-only"
                />
                <div className="w-9 h-5 rounded-full bg-neutral-300 dark:bg-neutral-600 transition-colors peer-checked:bg-primary-500 dark:peer-checked:bg-primary-500" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
              </div>
              <div>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Billable</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">Mark this entry as billable time</span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="animate-field-in flex items-center justify-end gap-3 pt-5 border-t border-neutral-200/80 dark:border-neutral-700/60" style={{ "--field-delay": "400ms" } as React.CSSProperties}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      </form>

      {/* Breaks Section */}
      <div className="mt-6 pt-6 border-t border-neutral-200/80 dark:border-neutral-700/60 animate-field-in" style={{ "--field-delay": "440ms" } as React.CSSProperties}>
        <TimeEntryBreaks
          timeEntryId={entry.id}
          userTimezone={userTimezone}
          entryTimezone={entryTimezone}
          entryStartedAt={entry.startedAt}
          initialBreaks={breaks?.map(breakItem => ({
            ...breakItem,
            createdAt: breakItem.createdAt || new Date(),
            updatedAt: breakItem.updatedAt || new Date(),
          }))}
        />
      </div>
    </>
  );
}
