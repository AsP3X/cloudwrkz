/**
 * Enhanced search query parser and types.
 * When the user starts a search with ">", the following parameters are supported:
 *
 * FUZZY (dynamic) — matched flexibly; only these contribute to the text search:
 * - search "TEXT" — main fuzzy search text
 * - label: "TEXT" — fuzzy search in labels
 * - tag: "TEXT" — fuzzy search in tags
 * - description: "TEXT" — fuzzy search in description
 *
 * STRICT — exact filters; when they don't match anything, the search returns no results:
 * - date: "FIXED DATE" — exact creation date
 * - timestamp: "FROM-TO" — exact date range (created)
 * - type: "TYPE" — exact result type (tickets, todo, time entries, links, archive, users)
 */
// Human: Parses the `>` advanced search mini-language into fuzzy text tokens and strict filters for the global search UI.
// Agent: EXPORTS PREFIX PARAM constants TYPE_OPTIONS; parseEnhancedSearchQuery RETURNS EnhancedSearchParams|null; PURE string parser.

export const ENHANCED_SEARCH_PREFIX = ">";

/** Keys that use fuzzy/dynamic matching for the text query. Only these are combined into the search term. */
export const ENHANCED_SEARCH_FUZZY_PARAM_KEYS = ["search", "label", "tag", "description"] as const;

/** Keys that are strict filters; when they don't match, the overall search returns no results. */
export const ENHANCED_SEARCH_STRICT_PARAM_KEYS = ["date", "timestamp", "type"] as const;

export type EnhancedSearchParams = {
  search?: string;
  date?: string;
  timestamp?: string;
  label?: string;
  tag?: string;
  type?: string;
  description?: string;
};

/** Result type values for enhanced search type: filter */
export const ENHANCED_SEARCH_TYPE_OPTIONS = [
  { value: "tickets", label: "Tickets" },
  { value: "todo", label: "Todo / Tasks" },
  { value: "timeentry", label: "Time Entries" },
  { value: "links", label: "Links" },
  { value: "video", label: "Video links" },
  { value: "website", label: "Website links" },
  { value: "file", label: "File links" },
  { value: "document", label: "Document links" },
  { value: "image", label: "Image links" },
  { value: "archive", label: "Archive" },
  { value: "users", label: "Users" },
] as const;

/** Parameter names for autocomplete (order and display). kind: fuzzy = dynamic text match; strict = exact filter (no match → no results). */
export const ENHANCED_SEARCH_PARAM_NAMES = [
  { key: "search", label: "search", snippet: 'search "', kind: "fuzzy" as const },
  { key: "date", label: "date", snippet: 'date: "', kind: "strict" as const },
  { key: "timestamp", label: "timestamp", snippet: 'timestamp: "', kind: "strict" as const },
  { key: "label", label: "label", snippet: 'label: "', kind: "fuzzy" as const },
  { key: "tag", label: "tag", snippet: 'tag: "', kind: "fuzzy" as const },
  { key: "type", label: "type", snippet: 'type: "', kind: "strict" as const },
  { key: "description", label: "description", snippet: 'description: "', kind: "fuzzy" as const },
] as const;

/**
 * Parse a quoted string: returns the content and the end index after the closing quote.
 * Handles escaped quotes inside the string.
 */
function parseQuotedString(s: string, start: number): { value: string; endIndex: number } | null {
  const openQuote = s.indexOf('"', start);
  if (openQuote === -1) return null;
  let i = openQuote + 1;
  let value = "";
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      value += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value, endIndex: i + 1 };
    }
    value += ch;
    i++;
  }
  return null;
}

/**
 * Parse enhanced search input (without the leading ">").
 * Format: optional search "text", then comma-separated key: "value" pairs.
 */
// Human: Walks a trimmed `>` query body, extracting quoted search text plus comma-separated key:value filters the API understands.
// Agent: USES parseQuotedString; REGEX keyValueRegex over knownKeys; RETURNS params object or null when empty.

export function parseEnhancedSearchQuery(input: string): EnhancedSearchParams | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const params: EnhancedSearchParams = {};
  let i = 0;

  // Skip optional "search" keyword and whitespace before first quote
  const searchKeyword = /^\s*search\s+/i;
  const searchMatch = trimmed.match(searchKeyword);
  if (searchMatch) {
    i = searchMatch[0].length;
  }

  // First quoted string → search text (if we're at start or after "search")
  if (i < trimmed.length && trimmed[i] === '"') {
    const parsed = parseQuotedString(trimmed, 0);
    if (parsed) {
      params.search = parsed.value.trim() || undefined;
      i = parsed.endIndex;
    }
  }

  const knownKeys = ["date", "timestamp", "label", "tag", "type", "description"];
  const keyValueRegex = new RegExp(
    `\\s*,\\s*(${knownKeys.join("|")})\\s*:\\s*"`,
    "gi"
  );

  let rest = trimmed.slice(i);
  let match: RegExpExecArray | null;
  keyValueRegex.lastIndex = 0;
  while ((match = keyValueRegex.exec(rest)) !== null) {
    const key = match[1].toLowerCase();
    const valueStart = match.index + match[0].length - 1; // index of the opening "
    const parsed = parseQuotedString(rest, valueStart);
    if (parsed) {
      const value = parsed.value.trim();
      if (key === "date") params.date = value || undefined;
      else if (key === "timestamp") params.timestamp = value || undefined;
      else if (key === "label") params.label = value || undefined;
      else if (key === "tag") params.tag = value || undefined;
      else if (key === "type") params.type = value || undefined;
      else if (key === "description") params.description = value || undefined;
    }
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Check if the raw query (including ">") is enhanced search.
 */
export function isEnhancedSearchQuery(rawQuery: string): boolean {
  return rawQuery.trimStart().startsWith(ENHANCED_SEARCH_PREFIX);
}

/**
 * Get the query body after ">" for parsing and display.
 */
export function getEnhancedSearchBody(rawQuery: string): string {
  const trimmed = rawQuery.trimStart();
  if (!trimmed.startsWith(ENHANCED_SEARCH_PREFIX)) return trimmed;
  return trimmed.slice(ENHANCED_SEARCH_PREFIX.length).trim();
}

/**
 * Parse timestamp range "FROM-TO" or "FROM to TO" into [from, to] dates (ISO date strings).
 */
export function parseTimestampRange(timestamp: string): { from?: string; to?: string } {
  const normalized = timestamp.replace(/\s+to\s+/i, "-").trim();
  const parts = normalized.split(/-+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { from: parts[0], to: parts[parts.length - 1] };
  }
  if (parts.length === 1) {
    return { from: parts[0], to: parts[0] };
  }
  return {};
}

/** Link type enum values used when filtering by type: "video" etc. */
export const LINK_TYPE_VALUES = ["WEBSITE", "FILE", "DOCUMENT", "VIDEO", "IMAGE", "OTHER"] as const;

/**
 * Map enhanced "type" value to SearchResult type(s), archive flag, and optional link type.
 * When type is a link kind (video, website, file, etc.), only link results with that linkType are returned.
 */
export function mapEnhancedTypeToResultTypes(
  type: string
): { resultTypes?: string[]; archiveOnly?: boolean; linkType?: string } {
  const lower = type.toLowerCase().trim();
  if (lower === "ticket" || lower === "tickets") return { resultTypes: ["ticket", "comment"] };
  if (lower === "todo" || lower === "todos" || lower === "task" || lower === "tasks")
    return { resultTypes: ["task", "subtask"] };
  if (lower === "timeentry" || lower === "time entries" || lower === "time")
    return { resultTypes: ["timeentry"] };
  if (lower === "links" || lower === "link") return { resultTypes: ["link"] };
  if (lower === "users" || lower === "user") return { resultTypes: ["user"] };
  if (lower === "archive" || lower === "archived") return { archiveOnly: true };
  if (lower === "settings" || lower === "setting") return { resultTypes: ["setting"] };
  // Link types: restrict to link results with this linkType
  if (lower === "video" || lower === "videos") return { resultTypes: ["link"], linkType: "VIDEO" };
  if (lower === "website" || lower === "websites") return { resultTypes: ["link"], linkType: "WEBSITE" };
  if (lower === "file" || lower === "files") return { resultTypes: ["link"], linkType: "FILE" };
  if (lower === "document" || lower === "documents") return { resultTypes: ["link"], linkType: "DOCUMENT" };
  if (lower === "image" || lower === "images") return { resultTypes: ["link"], linkType: "IMAGE" };
  if (lower === "other") return { resultTypes: ["link"], linkType: "OTHER" };
  return {};
}
