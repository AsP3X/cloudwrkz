import React from "react";
import { Input, type InputProps } from "@/components/ui/Input";
import { searchApi } from "@/api/client";

interface LocationSuggestion {
  place_id: number | string;
  display_name: string;
  address?: Record<string, unknown>;
}

interface DecoratedLocationSuggestion {
  item: LocationSuggestion;
  source: "history" | "map";
  label: string;
}

function buildSuggestionLabel(suggestion: LocationSuggestion): string {
  const address = suggestion.address ?? {};
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
  const streetLine = road && houseNumber ? `${road} ${houseNumber}` : road || undefined;
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

  if (parts.length > 0) return parts.join(", ");
  return suggestion.display_name;
}

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

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setQuery(value ?? "");
  }, [value]);

  React.useEffect(() => {
    if (!query || query.trim().length < 3 || disabled) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
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
            signal: controller.signal,
          }),
          searchApi.get<LocationSuggestion[]>(
            `/api/location-history?q=${encodeURIComponent(trimmedQuery)}`,
            { signal: controller.signal },
          ),
        ]);

        let combined: DecoratedLocationSuggestion[] = [];

        if (nominatimRes.status === "fulfilled" && nominatimRes.value.ok) {
          const osmData = (await nominatimRes.value.json()) as LocationSuggestion[];
          combined = combined.concat(
            osmData.map((item) => ({
              item,
              source: "map",
              label: buildSuggestionLabel(item),
            }))
          );
        }

        if (historyRes.status === "fulfilled") {
          combined = combined.concat(
            historyRes.value.map((item) => ({
              item,
              source: "history",
              label: buildSuggestionLabel(item),
            }))
          );
        }

        const seen = new Set<string>();
        const unique: DecoratedLocationSuggestion[] = [];
        for (const item of combined) {
          if (seen.has(item.label)) continue;
          seen.add(item.label);
          unique.push(item);
        }

        setSuggestions(unique);
        setIsOpen(unique.length > 0);
        setHighlightedIndex(unique.length > 0 ? 0 : null);
      } catch (error: any) {
        if (error.name !== "AbortError") {
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

  const handleSelect = (suggestion: DecoratedLocationSuggestion) => {
    const typed = query.trim();
    const label = suggestion.label;
    const typedLower = typed.toLowerCase();
    const labelLower = label.toLowerCase();

    const newValue =
      !typed || (labelLower.startsWith(typedLower) && label.length > typed.length) ? label : typed;

    setQuery(newValue);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(null);
    onChange?.(newValue);
  };

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
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
      {showDropdown && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-neutral-200/90 bg-white/95 shadow-xl backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95 p-1 flex flex-col items-start gap-1"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => {
            const isHistory = suggestion.source === "history";
            return (
              <li
                key={`${suggestion.item.place_id}-${suggestion.label}`}
                role="option"
                aria-selected={highlightedIndex === index}
                className={[
                  "w-fit max-w-full px-3 py-2.5 text-sm cursor-pointer text-neutral-800 dark:text-neutral-100 rounded-lg transition-colors",
                  highlightedIndex === index
                    ? "bg-primary-50 dark:bg-primary-900/40"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                ].join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-neutral-400 dark:text-neutral-500">
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
                  <div className="min-w-0">
                    <div className="truncate">{renderHighlighted(suggestion.label)}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {isHistory ? "Recent location" : "Map suggestion"}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
