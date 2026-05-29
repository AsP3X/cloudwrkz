// Human: Tag entry with debounced suggestions from `/time-tracking/tags`, excluding already-selected tags, plus keyboard navigation; dropdown is portaled so dialog overflow and footer borders do not block clicks.
// Agent: HTTP GET /time-tracking/tags; FILTERS selectedTags; PORTALS listbox to document.body fixed z-[9999]; MOUSEDOWN commit prevents blur race; CALLS onSubmitTag on Enter when no suggestion chosen.
import React from "react";
import { createPortal } from "react-dom";
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
  const [dropdownPosition, setDropdownPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dropdownRef = React.useRef<HTMLUListElement | null>(null);
  const fetchGenerationRef = React.useRef(0);

  React.useEffect(() => {
    const query = value.trim();
    if (disabled || (!isFocused && !query)) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(null);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    setIsLoading(true);

    const handle = window.setTimeout(async () => {
      try {
        const response = await api.get<{ tags?: string[] }>(
          `/time-tracking/tags?q=${encodeURIComponent(query)}`,
        );

        if (generation !== fetchGenerationRef.current) {
          return;
        }

        const next = (response.tags ?? []).filter((tag) => !selectedTags.includes(tag));
        setSuggestions(next);
        setIsOpen(next.length > 0);
        setHighlightedIndex(next.length > 0 ? 0 : null);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (generation === fetchGenerationRef.current) {
          setSuggestions([]);
          setIsOpen(false);
          setHighlightedIndex(null);
        }
      } finally {
        if (generation === fetchGenerationRef.current) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(handle);
    };
  }, [value, disabled, selectedTags, isFocused]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!isOpen || !containerRef.current) {
      setDropdownPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, suggestions.length]);

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

  const showDropdown = isOpen && suggestions.length > 0 && dropdownPosition;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
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
        <div className="absolute right-3 top-2.5 text-xs text-neutral-400 dark:text-neutral-500 pointer-events-none">
          Suggesting...
        </div>
      )}

      {showDropdown &&
        createPortal(
          <ul
            ref={dropdownRef}
            role="listbox"
            className="fixed z-[9999] max-h-52 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-soft-lg p-1"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {suggestions.map((suggestion, index) => {
              const active = highlightedIndex === index;
              return (
                <li
                  key={suggestion}
                  role="option"
                  aria-selected={active}
                  className={[
                    "w-full px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors flex items-center gap-2",
                    active
                      ? "bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-200"
                      : "text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  ].join(" ")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commitSuggestion(suggestion);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="inline-flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-900/70 dark:text-primary-300 text-[10px] font-bold">
                    #
                  </span>
                  <span className="truncate">{renderHighlightedMatch(suggestion, value)}</span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
