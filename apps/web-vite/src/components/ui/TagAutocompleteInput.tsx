// Human: Tag entry with debounced suggestions from `/time-tracking/tags`, excluding already-selected tags, plus keyboard navigation and Enter-to-submit behavior.
// Agent: HTTP GET /time-tracking/tags; FILTERS selectedTags; LISTENS mousedown outside; CALLS onSubmitTag on Enter when no suggestion chosen.
import React from "react";
import { api } from "@/api/client";

interface TagAutocompleteInputProps {
  id: string;
  value: string;
  selectedTags: string[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmitTag: () => void;
}

function renderHighlightedMatch(label: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return label;

  const lowerLabel = label.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const matchIndex = lowerLabel.indexOf(lowerQuery);
  if (matchIndex < 0) return label;

  const before = label.slice(0, matchIndex);
  const match = label.slice(matchIndex, matchIndex + trimmed.length);
  const after = label.slice(matchIndex + trimmed.length);

  return (
    <>
      {before}
      <mark className="bg-transparent text-primary-600 dark:text-primary-300 font-semibold">{match}</mark>
      {after}
    </>
  );
}

export function TagAutocompleteInput({
  id,
  value,
  selectedTags,
  placeholder = "Add a tag",
  disabled,
  onChange,
  onSubmitTag,
}: TagAutocompleteInputProps) {
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState<number | null>(null);
  const [isFocused, setIsFocused] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const query = value.trim();
    if (disabled || (!isFocused && !query)) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const handle = window.setTimeout(async () => {
      try {
        const response = await api.get<{ tags?: string[] }>(
          `/time-tracking/tags?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        const next = (response.tags ?? []).filter((tag) => !selectedTags.includes(tag));
        setSuggestions(next);
        setIsOpen(next.length > 0);
        setHighlightedIndex(next.length > 0 ? 0 : null);
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          setSuggestions([]);
          setIsOpen(false);
          setHighlightedIndex(null);
        }
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [value, disabled, selectedTags, isFocused]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commitSuggestion = (tag: string) => {
    onChange(tag);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(null);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev === null ? 0 : (prev + 1) % suggestions.length));
      return;
    }

    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) =>
        prev === null ? suggestions.length - 1 : (prev - 1 + suggestions.length) % suggestions.length
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && highlightedIndex !== null && suggestions[highlightedIndex]) {
        commitSuggestion(suggestions[highlightedIndex]);
        return;
      }
      onSubmitTag();
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          if (suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="flex-1 w-full px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      />

      {isLoading && (
        <div className="absolute right-3 top-2.5 text-xs text-neutral-400 dark:text-neutral-500">
          Suggesting...
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-52 overflow-auto rounded-xl border border-neutral-200/90 dark:border-neutral-700/80 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-xl p-1 flex flex-col items-start gap-1"
        >
          {suggestions.map((suggestion, index) => {
            const active = highlightedIndex === index;
            return (
              <li key={suggestion} role="option" aria-selected={active} className="w-fit max-w-full">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => commitSuggestion(suggestion)}
                  className={[
                    "inline-flex max-w-full text-left px-3 py-2.5 items-center gap-2 text-sm rounded-lg transition-colors",
                    active
                      ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200"
                      : "text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  ].join(" ")}
                >
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-900/70 dark:text-primary-300 text-[10px] font-bold">
                    #
                  </span>
                  <span className="truncate">{renderHighlightedMatch(suggestion, value)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
