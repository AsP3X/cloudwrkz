"use client";

import React from "react";
import { Input } from "@/components/ui/Input";
import type { InputProps } from "@/components/ui/Input/Input.types";

interface LocationSuggestion {
  place_id: number;
  display_name: string;
  // Nominatim can return structured address parts which we use to
  // construct a more precise label including house numbers where possible.
  address?: Record<string, unknown>;
}

function buildSuggestionLabel(suggestion: LocationSuggestion): string {
  const address = suggestion.address ?? {};

  // Helper to safely read string fields
  const get = (key: string): string | undefined => {
    const value = (address as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  };

  const houseNumber = get("house_number");
  const road =
    get("road") ||
    get("pedestrian") ||
    get("footway") ||
    get("cycleway") ||
    get("path") ||
    get("residential") ||
    get("street");

  const streetLine =
    road && houseNumber
      ? `${road} ${houseNumber}`
      : road || undefined;

  const city =
    get("city") ||
    get("town") ||
    get("village") ||
    get("suburb") ||
    get("neighbourhood") ||
    get("county");

  const state = get("state") || get("region");
  const postcode = get("postcode");
  const country = get("country");

  const parts = [streetLine, city, state, postcode, country].filter(Boolean) as string[];

  if (parts.length > 0) {
    return parts.join(", ");
  }

  // Fallback to Nominatim's own label if we couldn't construct one
  return suggestion.display_name;
}

interface LocationAutocompleteInputProps extends Omit<InputProps, "onChange"> {
  onChange?: (value: string) => void;
  value?: string;
}

/**
 * Location input with address suggestions powered by OpenStreetMap (Nominatim).
 *
 * NOTE: This component makes client-side requests directly to the public Nominatim API.
 * It is debounced and requires at least 3 characters to limit request volume.
 */
export function LocationAutocompleteInput({
  value,
  onChange,
  disabled,
  ...rest
}: LocationAutocompleteInputProps) {
  const [query, setQuery] = React.useState(value ?? "");
  const [suggestions, setSuggestions] = React.useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState<number | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Keep internal query in sync when value changes from outside
  React.useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  // Fetch suggestions from OpenStreetMap Nominatim with debounce
  React.useEffect(() => {
    if (!query || query.trim().length < 3 || disabled) {
      setSuggestions([]);
      setIsOpen(false);
      if (abortRef.current) {
        abortRef.current.abort();
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

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
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          }),
          fetch(`/api/location-history?q=${encodeURIComponent(trimmedQuery)}`, {
            method: "GET",
            signal: controller.signal,
          }),
        ]);

        let combined: LocationSuggestion[] = [];

        if (nominatimRes.status === "fulfilled" && nominatimRes.value.ok) {
          const osmData = (await nominatimRes.value.json()) as LocationSuggestion[];
          combined = combined.concat(osmData);
        }

        if (historyRes.status === "fulfilled" && historyRes.value.ok) {
          const historyData = (await historyRes.value.json()) as LocationSuggestion[];
          combined = combined.concat(historyData);
        }

        // Deduplicate by display label to avoid showing duplicates
        const seen = new Set<string>();
        const unique: LocationSuggestion[] = [];
        for (const item of combined) {
          const label = buildSuggestionLabel(item);
          if (seen.has(label)) continue;
          seen.add(label);
          unique.push(item);
        }

        setSuggestions(unique);
        setIsOpen(unique.length > 0);
        setHighlightedIndex(unique.length > 0 ? 0 : null);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          // Swallow network errors – keep input usable even if suggestions fail
          setSuggestions([]);
          setIsOpen(false);
          setHighlightedIndex(null);
        }
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [query, disabled]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    const typed = query.trim();
    const label = buildSuggestionLabel(suggestion);

    const hasNumberInQuery = /\d/.test(typed);
    const hasNumberInLabel = /\d/.test(label);

    // If the user typed a house number but the suggestion label does not
    // include any number (typical for street-level or area-level results),
    // prefer keeping the user's full input so we don't lose the house number.
    const newValue = hasNumberInQuery && !hasNumberInLabel ? typed : label;
    setQuery(newValue);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(null);
    onChange?.(newValue);
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const newValue = e.target.value;
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

  // Close dropdown when clicking outside
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

  const showDropdown = isOpen && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Input
        {...rest}
        value={query}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="off"
        onKeyDown={handleKeyDown}
      />
      {isLoading && (
        <div className="absolute right-3 top-3.5 text-xs text-neutral-400 dark:text-neutral-500">
          Searching…
        </div>
      )}
      {showDropdown && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          role="listbox"
        >
          {suggestions
            .slice()
            .sort((a, b) => {
              const aHasNumber = /\d/.test(buildSuggestionLabel(a)) ? 1 : 0;
              const bHasNumber = /\d/.test(buildSuggestionLabel(b)) ? 1 : 0;
              return bHasNumber - aHasNumber;
            })
            .map((s, index) => {
              const label = buildSuggestionLabel(s);
              return (
                <li
                  key={s.place_id}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  className={[
                    "px-3 py-2 text-sm cursor-pointer text-neutral-800 dark:text-neutral-100",
                    highlightedIndex === index
                      ? "bg-primary-50 dark:bg-primary-900/40"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  ].join(" ")}
                  onMouseDown={(e) => {
                    // Prevent input from losing focus before click handler runs
                    e.preventDefault();
                  }}
                  onClick={() => handleSelect(s)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {label}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

