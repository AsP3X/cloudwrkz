// Human: Nested dialog to search existing time-entry tags, multi-select suggestions, and create new tag names before adding them to the parent form.
// Agent: GET /time-tracking/tags debounced; STATE pending Set; EMITS onConfirm string[]; nested Dialog z-[110]; SKIPS tags already on entry for selection.
import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/api/client";

export interface TimeEntryTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tags already on the time entry (shown as added, not selectable again). */
  existingTags: string[];
  onConfirm: (tagsToAdd: string[]) => void;
}

function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

export function TimeEntryTagsDialog({
  open,
  onOpenChange,
  existingTags,
  onConfirm,
}: TimeEntryTagsDialogProps) {
  const [search, setSearch] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Set<string>>(() => new Set());

  const existingKeys = React.useMemo(
    () => new Set(existingTags.map(tagKey)),
    [existingTags],
  );

  const pendingKeys = React.useMemo(() => new Set([...pending].map(tagKey)), [pending]);

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    setSuggestions([]);
    setPending(new Set());
    setLoadError(null);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const q = search.trim();
        const path =
          q.length > 0
            ? `/time-tracking/tags?q=${encodeURIComponent(q)}`
            : "/time-tracking/tags";
        const response = await api.get<{ tags?: string[] }>(path, {
          signal: controller.signal,
        });
        setSuggestions(response.tags ?? []);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        setSuggestions([]);
        setLoadError(error instanceof Error ? error.message : "Could not load tags");
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [open, search]);

  const createCandidate = search.trim();
  const canCreate =
    createCandidate.length > 0 &&
    !existingKeys.has(tagKey(createCandidate)) &&
    !pendingKeys.has(tagKey(createCandidate)) &&
    !suggestions.some((tag) => tagKey(tag) === tagKey(createCandidate));

  const visibleSuggestions = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const seen = new Set<string>();
    const list: string[] = [];
    for (const tag of suggestions) {
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      if (q && !key.includes(q)) continue;
      seen.add(key);
      list.push(tag);
    }
    return list;
  }, [suggestions, search]);

  const onEntryVisible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return existingTags.filter((tag) => !q || tagKey(tag).includes(q));
  }, [existingTags, search]);

  const addableInView = visibleSuggestions.filter((tag) => !existingKeys.has(tagKey(tag)));

  const allAddableSelected =
    addableInView.length > 0 &&
    addableInView.every((tag) => pendingKeys.has(tagKey(tag)));

  const togglePending = (tag: string) => {
    const key = tagKey(tag);
    if (existingKeys.has(key)) return;
    setPending((prev) => {
      const next = new Set(prev);
      const existing = [...next].find((item) => tagKey(item) === key);
      if (existing) next.delete(existing);
      else next.add(tag.trim());
      return next;
    });
  };

  const selectAllVisible = () => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const tag of addableInView) {
        next.add(tag);
      }
      if (canCreate) next.add(createCandidate);
      return next;
    });
  };

  const clearPending = () => setPending(new Set());

  const handleConfirm = () => {
    if (pending.size === 0) return;
    onConfirm([...pending]);
    onOpenChange(false);
  };

  const pendingCount = pending.size;

  return (
    <Dialog
      nested
      open={open}
      onOpenChange={onOpenChange}
      title="Add tags"
      description="Search existing tags or create new ones. Select multiple, then add."
    >
      <div className="px-5 sm:px-7 py-5 space-y-4">
        <Input
          type="search"
          label="Search tags"
          placeholder="Type to find or create a tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          autoFocus
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={addableInView.length === 0 && !canCreate}
            onClick={allAddableSelected ? clearPending : selectAllVisible}
          >
            {allAddableSelected ? "Clear selection" : "Select all shown"}
          </Button>
          {pendingCount > 0 && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {pendingCount} selected
            </span>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 max-h-64 overflow-y-auto scrollbar-thin divide-y divide-neutral-100 dark:divide-neutral-800">
          {isLoading && (
            <p className="px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400 text-center">
              Loading tags…
            </p>
          )}

          {!isLoading && loadError && (
            <p className="px-4 py-6 text-sm text-error-600 dark:text-error-400 text-center">{loadError}</p>
          )}

          {!isLoading && !loadError && canCreate && (
            <TagRow
              tag={createCandidate}
              checked={pendingKeys.has(tagKey(createCandidate))}
              disabled={false}
              subtitle="Create new tag"
              onToggle={() => togglePending(createCandidate)}
            />
          )}

          {!isLoading && !loadError && onEntryVisible.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                On this entry
              </p>
              {onEntryVisible.map((tag) => (
                <TagRow
                  key={`on-entry-${tag}`}
                  tag={tag}
                  checked
                  disabled
                  subtitle="Already added"
                  onToggle={() => undefined}
                />
              ))}
            </div>
          )}

          {!isLoading && !loadError && visibleSuggestions.length > 0 && (
            <div>
              {onEntryVisible.length > 0 && (
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  Suggestions
                </p>
              )}
              {visibleSuggestions.map((tag) => {
                const onEntry = existingKeys.has(tagKey(tag));
                return (
                  <TagRow
                    key={tag}
                    tag={tag}
                    checked={onEntry || pendingKeys.has(tagKey(tag))}
                    disabled={onEntry}
                    subtitle={onEntry ? "Already added" : undefined}
                    onToggle={() => togglePending(tag)}
                  />
                );
              })}
            </div>
          )}

          {!isLoading &&
            !loadError &&
            !canCreate &&
            onEntryVisible.length === 0 &&
            visibleSuggestions.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400 text-center">
                {search.trim() ? "No matching tags. Type a new name above to create one." : "No tags yet. Type a name to create your first tag."}
              </p>
            )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-200/80 dark:border-neutral-700/60">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={pendingCount === 0}>
            Add {pendingCount > 0 ? `(${pendingCount})` : "tags"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TagRow({
  tag,
  checked,
  disabled,
  subtitle,
  onToggle,
}: {
  tag: string;
  checked: boolean;
  disabled: boolean;
  subtitle?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
        disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/80",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-800"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-900/70 dark:text-primary-300 text-[10px] font-bold">
            #
          </span>
          <span className="truncate">{tag}</span>
        </span>
        {subtitle && (
          <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</span>
        )}
      </span>
    </label>
  );
}
