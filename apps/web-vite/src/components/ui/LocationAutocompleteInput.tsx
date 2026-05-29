// Human: Address field that merges OpenStreetMap Nominatim suggestions with server-backed recent locations, debounced fetch, keyboard listbox, and a portaled dropdown anchored to the input.
// Agent: HTTP GET nominatim + GET /location-history; POST /location-history on select; ABORTABLE debounce 400ms; PORTALS listbox to document.body; MERGE via mergeAndRankLocationSuggestions.
import React from "react";
import { createPortal } from "react-dom";
import { Input, type InputProps } from "@/components/ui/Input";
import { api } from "@/api/client";
import {
  mergeAndRankLocationSuggestions,
  parseLocationHistoryResponse,
  type DecoratedLocationSuggestion,
  type LocationSuggestion,
} from "@/lib/locationAutocomplete";

interface LocationAutocompleteInputProps extends Omit<InputProps, "onChange"> {
  onChange?: (value: string) => void;
  value?: string;
}

export function LocationAutocompleteInput({
  value,
  onChange,
  disabled,
  ...rest
}: LocationAutocompleteInputProps) {
  const [query, setQuery] = React.useState(value ?? "");
  const [suggestions, setSuggestions] = React.useState<DecoratedLocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState<number | null>(null);
  const [suppressSuggestions, setSuppressSuggestions] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const fetchGenerationRef = React.useRef(0);

  React.useEffect(() => {
    setQuery(value ?? "");
    if ((value ?? "") !== (selectedValue ?? "")) {
      setSuppressSuggestions(false);
      setSelectedValue(null);
    }
  }, [value, selectedValue]);

  React.useEffect(() => {
    if (suppressSuggestions || !query || query.trim().length < 3 || disabled) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const nominatimController = new AbortController();
    const generation = ++fetchGenerationRef.current;
    setIsLoading(true);

    const handle = window.setTimeout(async () => {
      try {
        const trimmedQuery = query.trim();

        const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
        nominatimUrl.searchParams.set("format", "json");
        nominatimUrl.searchParams.set("q", trimmedQuery);
        nominatimUrl.searchParams.set("addressdetails", "1");
        nominatimUrl.searchParams.set("limit", "10");
        nominatimUrl.searchParams.set("dedupe", "1");

        const [nominatimRes, historyRes] = await Promise.allSettled([
          fetch(nominatimUrl.toString(), {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: nominatimController.signal,
          }),
          api.get<unknown>(`/location-history?q=${encodeURIComponent(trimmedQuery)}`),
        ]);

        if (generation !== fetchGenerationRef.current) {
          return;
        }

        let mapItems: LocationSuggestion[] = [];
        if (nominatimRes.status === "fulfilled" && nominatimRes.value.ok) {
          mapItems = (await nominatimRes.value.json()) as LocationSuggestion[];
        }

        const historyAddresses =
          historyRes.status === "fulfilled"
            ? parseLocationHistoryResponse(historyRes.value)
            : [];

        const unique = mergeAndRankLocationSuggestions(
          historyAddresses,
          mapItems,
          trimmedQuery,
        );

        setSuggestions(unique);
        setIsOpen(unique.length > 0);
        setHighlightedIndex(unique.length > 0 ? 0 : null);
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
    }, 400);

    return () => {
      window.clearTimeout(handle);
      nominatimController.abort();
    };
  }, [query, disabled, suppressSuggestions]);

  const handleSelect = (suggestion: DecoratedLocationSuggestion) => {
    const label = suggestion.label;
    setQuery(label);
    setSelectedValue(label);
    setSuppressSuggestions(true);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(null);
    onChange?.(label);
    void api.post("/location-history", { address: label });
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const newValue = e.target.value;
    if (selectedValue !== null && newValue !== selectedValue) {
      setSuppressSuggestions(false);
      setSelectedValue(null);
    }
    setQuery(newValue);
    onChange?.(newValue);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        if (prev === null) return 0;
        return (prev + 1) % suggestions.length;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        if (prev === null) return suggestions.length - 1;
        return (prev - 1 + suggestions.length) % suggestions.length;
      });
    } else if (e.key === "Enter") {
      if (highlightedIndex !== null && suggestions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen || !containerRef.current) return;

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
  }, [isOpen]);

  const showDropdown = isOpen && suggestions.length > 0;

  const renderHighlighted = (label: string) => {
    const trimmed = query.trim();
    if (!trimmed) return label;
    const idx = label.toLowerCase().indexOf(trimmed.toLowerCase());
    if (idx < 0) return label;
    return (
      <>
        {label.slice(0, idx)}
        <mark className="bg-transparent text-primary-600 dark:text-primary-300 font-semibold">
          {label.slice(idx, idx + trimmed.length)}
        </mark>
        {label.slice(idx + trimmed.length)}
      </>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        {...rest}
        value={query}
        onChange={handleInputChange}
        disabled={disabled}
        autoComplete="off"
        onKeyDown={handleKeyDown}
      />
      {isLoading && (
        <div className="absolute right-3 top-3.5 text-xs text-neutral-400 dark:text-neutral-500">
          Searching...
        </div>
      )}
      {showDropdown && dropdownPosition && createPortal(
        <ul
          className="fixed z-[9999] max-h-60 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-soft-lg p-1"
          role="listbox"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
          }}
        >
          {suggestions.map((suggestion, index) => {
            const isHistory = suggestion.source === "history";
            return (
              <li
                key={`${suggestion.item.place_id}-${suggestion.label}`}
                role="option"
                aria-selected={highlightedIndex === index}
                className={[
                  "w-full px-3 py-2 text-sm cursor-pointer text-neutral-800 dark:text-neutral-100 rounded-md transition-colors",
                  highlightedIndex === index
                    ? "bg-primary-50 dark:bg-primary-900/40"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                ].join(" ")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(suggestion);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-neutral-400 dark:text-neutral-500 flex-shrink-0">
                    {isHistory ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{renderHighlighted(suggestion.label)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {isHistory ? "Recent location" : "Map suggestion"}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
