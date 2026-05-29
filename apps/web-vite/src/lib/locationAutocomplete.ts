// Human: Pure helpers for location autocomplete — label formatting, parsing API history payloads, and merging history ahead of map results with dedupe and ranking.
// Agent: EXPORTS buildSuggestionLabel parseLocationHistoryResponse mergeAndRankLocationSuggestions; NO React/fetch; USED BY LocationAutocompleteInput + vitest.

export interface LocationSuggestion {
  place_id?: number | string;
  display_name: string;
  address?: Record<string, unknown>;
}

export type LocationSuggestionSource = "history" | "map";

export interface DecoratedLocationSuggestion {
  item: LocationSuggestion;
  source: LocationSuggestionSource;
  label: string;
}

// Human: Prefer a short street/city/postcode line built from structured address parts, and fall back to the raw display name when parts are missing.
// Agent: READS suggestion.address keys; RETURNS joined string or display_name.
export function buildSuggestionLabel(suggestion: LocationSuggestion): string {
  const address = suggestion.address ?? {};
  const get = (key: string): string | undefined => {
    const value = address[key];
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

// Human: The Rust API returns `{ locations: string[] }`, but older Next.js proxies returned a JSON array of Nominatim-shaped rows — accept both so history is never dropped silently.
// Agent: READS unknown JSON; RETURNS string labels; HANDLES envelope.locations OR array of strings/objects with display_name.
export function parseLocationHistoryResponse(data: unknown): string[] {
  if (Array.isArray(data)) {
    const labels: string[] = [];
    for (const item of data) {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (trimmed) labels.push(trimmed);
        continue;
      }
      if (item && typeof item === "object") {
        const row = item as LocationSuggestion;
        if (typeof row.display_name === "string" && row.display_name.trim()) {
          labels.push(buildSuggestionLabel(row));
        }
      }
    }
    return labels;
  }

  if (data && typeof data === "object" && "locations" in data) {
    const locations = (data as { locations?: unknown }).locations;
    if (!Array.isArray(locations)) return [];
    return locations
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function prefixRank(label: string, queryLower: string): number {
  if (!queryLower) return 1;
  const lower = label.toLowerCase();
  if (lower.startsWith(queryLower)) return 0;
  if (lower.includes(queryLower)) return 1;
  return 2;
}

// Human: Recent/history suggestions should appear above map hits; within each group, prefix matches rank higher than substring-only matches.
// Agent: MERGES history then map; DEDUPES case-insensitive keeping first (history wins); SORTS by source then prefixRank then label localeCompare.
export function mergeAndRankLocationSuggestions(
  historyAddresses: string[],
  mapItems: LocationSuggestion[],
  query: string,
): DecoratedLocationSuggestion[] {
  const queryLower = query.trim().toLowerCase();

  const historySuggestions: DecoratedLocationSuggestion[] = historyAddresses.map((address) => ({
    item: {
      place_id: `history-${address}`,
      display_name: address,
      address: {},
    },
    source: "history",
    label: address,
  }));

  const mapSuggestions: DecoratedLocationSuggestion[] = mapItems.map((item) => ({
    item,
    source: "map",
    label: buildSuggestionLabel(item),
  }));

  const seen = new Set<string>();
  const unique: DecoratedLocationSuggestion[] = [];
  for (const suggestion of [...historySuggestions, ...mapSuggestions]) {
    const key = suggestion.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }

  return unique.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "history" ? -1 : 1;
    }
    const rankA = prefixRank(a.label, queryLower);
    const rankB = prefixRank(b.label, queryLower);
    if (rankA !== rankB) return rankA - rankB;
    return a.label.localeCompare(b.label);
  });
}
