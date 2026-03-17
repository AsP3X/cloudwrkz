"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { createTimeEntrySchema, type CreateTimeEntryInput } from "@/lib/validations/time-tracking";
import { createTimeEntry } from "@/server/actions/time-tracking";
import { useRouter } from "next/navigation";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";
import { toDatetimeLocalValue } from "@/lib/utils/date";

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartTimerDialog({ open, onOpenChange }: StartTimerDialogProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    control,
    watch,
    setValue,
  } = useForm<CreateTimeEntryInput>({
    resolver: zodResolver(createTimeEntrySchema),
    defaultValues: {
      name: "",
      description: "",
      tags: [],
      billable: false,
      // startedAt will be set on dialog open on the client to avoid hydration issues
      startedAt: undefined,
    },
  });

  React.useEffect(() => {
    if (!open) {
      reset();
      setTags([]);
      setTagInput("");
      setServerError(null);
    }
  }, [open, reset]);

  // When the dialog opens, set a default startedAt to "now" on the client if not already set.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/incompatible-library
      const currentStartedAt = watch("startedAt"); // React Hook Form watch is safe here
      if (!currentStartedAt) {
        setValue("startedAt", new Date());
      }
    }
  }, [open, watch, setValue]);

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

  const onSubmit = async (data: CreateTimeEntryInput) => {
    setServerError(null);

    try {
      const result = await createTimeEntry({
        ...data,
        tags: tags.length > 0 ? tags : undefined,
        location: data.location?.trim() || undefined,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(result.error || "Failed to start timer");
      }
    } catch (error: any) {
      setServerError(error.message || "Failed to start timer");
    }
  };

  const startedAt = watch("startedAt");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      description="Create a new time tracking entry"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {serverError && (
          <div className="p-4 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
            <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
          </div>
        )}

        <Input
          label="Name"
          placeholder="Enter timer name (optional)"
          helperText="Leave empty to auto-generate a timer number (e.g., #TMR-000001)"
          {...register("name")}
          error={errors.name?.message}
        />

        <Textarea
          label="Description"
          placeholder="Optional description"
          {...register("description")}
          error={errors.description?.message}
        />

        <div>
          <label htmlFor="start-timer-start-time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Start Time
          </label>
          <Controller
            name="startedAt"
            control={control}
            render={({ field }) => (
              <input
                id="start-timer-start-time"
                type="datetime-local"
                value={field.value && !isNaN(new Date(field.value).getTime()) ? toDatetimeLocalValue(new Date(field.value)) : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    field.onChange(undefined);
                    return;
                  }
                  field.onChange(new Date(value));
                }}
                className="w-full px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            )}
          />
        </div>

        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <LocationAutocompleteInput
              label="Location"
              placeholder="Optional location/address"
              value={field.value ?? ""}
              onChange={(val) => field.onChange(val)}
              error={errors.location?.message}
            />
          )}
        />

        <div>
          <label htmlFor="start-timer-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              id="start-timer-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add a tag"
              className="flex-1 px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm"
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

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
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
