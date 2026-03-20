import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/api/client";
import { toDatetimeLocalValue } from "@/lib/utils/date";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";
import { TagAutocompleteInput } from "@/components/ui/TagAutocompleteInput";

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function StartTimerDialog({ open, onOpenChange, onCreated }: StartTimerDialogProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLocation("");
      setStartedAt(null);
      setTags([]);
      setTagInput("");
      setServerError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && !startedAt) {
      setStartedAt(new Date());
    }
  }, [open, startedAt]);

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
      await api.post("/time-tracking", {
        name: name.trim() || undefined,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
        location: location.trim() || undefined,
        started_at: startedAt?.toISOString(),
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
      <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {serverError && (
          <div className="p-4 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
            <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
          </div>
        )}

        <Input
          label="Name"
          placeholder="Enter timer name (optional)"
          helperText="Leave empty to auto-generate a timer number (e.g., #TMR-000001)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Textarea
          label="Description"
          placeholder="Optional description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label htmlFor="start-timer-start-time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Start Time
          </label>
          <input
            id="start-timer-start-time"
            type="datetime-local"
            value={startedAt && !isNaN(startedAt.getTime()) ? toDatetimeLocalValue(startedAt) : ""}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) {
                setStartedAt(null);
                return;
              }
              setStartedAt(new Date(value));
            }}
            className="w-full px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <LocationAutocompleteInput
          label="Location"
          placeholder="Optional location/address"
          value={location}
          onChange={setLocation}
        />

        <div>
          <label htmlFor="start-timer-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <TagAutocompleteInput
              id="start-timer-tags"
              value={tagInput}
              selectedTags={tags}
              onChange={setTagInput}
              onSubmitTag={handleAddTag}
              placeholder="Add a tag"
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
