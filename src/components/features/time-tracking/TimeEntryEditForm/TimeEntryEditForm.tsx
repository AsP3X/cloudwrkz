"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { updateTimeEntrySchema, type UpdateTimeEntryInput } from "@/lib/validations/time-tracking";
import { type TimeEntryStatus } from "@prisma/client";
import { TimeEntryBreaks } from "../TimeEntryBreaks";
import { COMMON_TIMEZONES } from "@/lib/constants/timezones";

type TimeEntry = {
  id: string;
  name: string;
  description: string | null;
  status: TimeEntryStatus;
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
  }>;
}

export function TimeEntryEditForm({ entry, onSave, onCancel, isSubmitting, userTimezone, entryTimezone, breaks = [] }: TimeEntryEditFormProps) {
  const [tags, setTags] = React.useState<string[]>(entry.tags);
  const [tagInput, setTagInput] = React.useState("");

  // Helper function to convert Date to datetime-local string (local time)
  const dateToLocalDateTimeString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const {
    register,
    handleSubmit,
    control,
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

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed];
      setTags(newTags);
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
      <style dangerouslySetInnerHTML={{
        __html: `
          html.dark #startedAt::-webkit-calendar-picker-indicator,
          .dark #startedAt::-webkit-calendar-picker-indicator {
            filter: invert(1) brightness(2) contrast(1.2) !important;
            opacity: 1 !important;
          }
        `
      }} />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Name *
        </label>
        <Input
          id="name"
          {...register("name")}
          error={errors.name?.message}
          placeholder="Timer name"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Description
        </label>
        <Textarea
          id="description"
          {...register("description")}
          error={errors.description?.message}
          placeholder="Optional description"
          rows={4}
        />
      </div>

      <div>
        <label htmlFor="location" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Location
        </label>
        <Input
          id="location"
          {...register("location")}
          error={errors.location?.message}
          placeholder="Optional location/address"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Timezone
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          Select a timezone for this entry. If not set, your user timezone ({userTimezone || "UTC"}) will be used.
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
                // Convert empty string to null for proper handling
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
          <p className="mt-1 text-sm text-error-600 dark:text-error-400">{errors.timezone.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Tags
        </label>
        <div className="flex gap-2 mb-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            placeholder="Add a tag"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={handleAddTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-primary-900 dark:hover:text-primary-100"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="startedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          Start Date & Time
        </label>
        <Controller
          name="startedAt"
          control={control}
          render={({ field }) => (
            <input
              type="datetime-local"
              id="startedAt"
              value={field.value ? dateToLocalDateTimeString(new Date(field.value)) : ""}
              onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
              className="w-full px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          )}
        />
        {errors.startedAt && (
          <p className="mt-1 text-sm text-error-600 dark:text-error-400">{errors.startedAt.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="stoppedAt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          End Date & Time
        </label>
        <Controller
          name="stoppedAt"
          control={control}
          render={({ field }) => (
            <input
              type="datetime-local"
              id="stoppedAt"
              value={field.value ? dateToLocalDateTimeString(new Date(field.value)) : ""}
              onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
              className="w-full px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          )}
        />
        {errors.stoppedAt && (
          <p className="mt-1 text-sm text-error-600 dark:text-error-400">{errors.stoppedAt.message}</p>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register("billable")}
            className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2"
          />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Billable</span>
        </label>
      </div>

      <div className="flex items-center gap-2 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>

    {/* Breaks Section */}
    <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
      <TimeEntryBreaks
        timeEntryId={entry.id}
        userTimezone={userTimezone}
        entryTimezone={entryTimezone}
        initialBreaks={breaks}
      />
    </div>
    </>
  );
}
