// Human: Tags section for time-entry forms — shows chips with remove, and opens the multi-select tag dialog instead of inline autocomplete.
// Agent: READS tags onChange; RENDERS TimeEntryTagsDialog; MERGES onConfirm unique case-insensitive tags.
import React from "react";
import { Button } from "@/components/ui/Button";
import { mergeTimeEntryTags } from "./mergeTimeEntryTags";
import { TimeEntryTagsDialog } from "./TimeEntryTagsDialog";

export interface TimeEntryTagsFieldProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  label?: string;
}

export function TimeEntryTagsField({
  tags,
  onChange,
  disabled,
  label = "Tags",
}: TimeEntryTagsFieldProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const handleRemove = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleConfirm = (tagsToAdd: string[]) => {
    onChange(mergeTimeEntryTags(tags, tagsToAdd));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setDialogOpen(true)}
          className="flex-shrink-0"
        >
          Add tags…
        </Button>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="animate-tag-pop inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-700/40 transition-all duration-200 hover:bg-primary-100 dark:hover:bg-primary-900/60"
            >
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemove(tag)}
                className="ml-0.5 p-0.5 rounded hover:bg-primary-200/60 dark:hover:bg-primary-800/60 transition-colors disabled:opacity-50"
                aria-label={`Remove tag ${tag}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No tags yet. Use Add tags to search or create.</p>
      )}

      <TimeEntryTagsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingTags={tags}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
