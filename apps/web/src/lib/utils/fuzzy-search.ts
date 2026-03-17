import Fuse, { type IFuseOptions, type FuseResultMatch } from "fuse.js";

/**
 * Fuzzy search configuration options
 */
export interface FuzzySearchOptions<T> {
  keys: Array<keyof T | { name: keyof T; weight?: number }>;
  threshold?: number; // 0.0 = perfect match, 1.0 = match anything
  minMatchCharLength?: number;
  ignoreLocation?: boolean;
  includeScore?: boolean;
  /**
   * When true, result includes Fuse match details (indices, value) for extracting snippets and highlighted text.
   */
  includeMatches?: boolean;
  /**
   * Enable Fuse.js extended search.
   *
   * If not explicitly set, extended search will automatically be enabled
   * when the query contains multiple whitespace-separated terms so that
   * all terms can be matched independently (logical AND).
   */
  useExtendedSearch?: boolean;
}

export type FuzzySearchResultWithMatches<T> = { item: T; score?: number; matches?: ReadonlyArray<FuseResultMatch> };

/**
 * Perform fuzzy search on an array of items
 * @param items Array of items to search through
 * @param query Search query string
 * @param options Fuse.js configuration options
 * @returns Array of search results with scores
 */
export function fuzzySearch<T extends Record<string, any>>(
  items: T[],
  query: string,
  options: FuzzySearchOptions<T> = { keys: [] }
): FuzzySearchResultWithMatches<T>[] {
  if (!query || query.trim().length === 0) {
    return items.map((item) => ({ item }));
  }

  const trimmedQuery = query.trim();
  const queryParts = trimmedQuery.split(/\s+/).filter(Boolean);

  // Automatically enable extended search when there are multiple terms,
  // unless explicitly overridden via options
  const useExtendedSearch =
    options.useExtendedSearch !== undefined ? options.useExtendedSearch : queryParts.length > 1;

  // For extended search, build an AND query where each term must be present.
  // We use `'term` (exact/contains) syntax for each token and join them with spaces,
  // which Fuse interprets as logical AND across terms.
  const searchTerm = useExtendedSearch
    ? queryParts.map((part) => `'${part}`).join(" ")
    : trimmedQuery;

  // Configure Fuse.js options
  const fuseOptions: IFuseOptions<T> = {
    keys: options.keys.map((key) => {
      if (typeof key === "object") {
        return { name: String(key.name), weight: key.weight || 1 };
      }
      return String(key);
    }),
    threshold: options.threshold ?? 0.4, // Default threshold for fuzzy matching
    minMatchCharLength: options.minMatchCharLength ?? 2,
    ignoreLocation: options.ignoreLocation ?? true,
    includeScore: options.includeScore ?? true,
    includeMatches: options.includeMatches ?? false,
    // Use extended search when we want multi-term AND-style matching
    useExtendedSearch,
    // Find all matches, not just the first
    findAllMatches: true,
  };

  const fuse = new Fuse(items, fuseOptions);
  const results = fuse.search(searchTerm);

  return results.map((result) => ({
    item: result.item,
    score: result.score,
    ...(options.includeMatches && result.matches && { matches: result.matches }),
  }));
}

/**
 * Escape special regex characters in a string for use in RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Require each word of the query to appear in the text as a whole word (word boundaries).
 * So "test" matches "test" or "testing" but not "fastest" or "latest".
 * @param text Searchable text (e.g. title + description)
 * @param query User search query (may be multi-word)
 */
export function textContainsQuery(text: string, query: string): boolean {
  if (!text || !query?.trim()) return false;
  const lower = text.toLowerCase();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => {
    if (word.length < 1) return true;
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    return re.test(lower);
  });
}

/**
 * Filter fuzzy results to only items whose searchable text contains the query
 * (or each word) as a substring. Prevents spurious matches like "search" → "ear".
 */
export function filterFuzzyBySubstringMatch<T>(
  results: FuzzySearchResultWithMatches<T>[],
  query: string,
  getSearchableText: (item: T) => string
): FuzzySearchResultWithMatches<T>[] {
  if (!query?.trim()) return results;
  return results.filter((r) => textContainsQuery(getSearchableText(r.item), query));
}

/**
 * Rank and limit fuzzy search results
 * @param results Array of search results with scores
 * @param limit Maximum number of results to return
 * @returns Limited array of results sorted by relevance
 */
export function rankAndLimit<T>(
  results: Array<{ item: T; score?: number }>,
  limit: number
): T[] {
  // Sort by score (lower is better in Fuse.js)
  const sorted = results.sort((a, b) => {
    const scoreA = a.score ?? 1;
    const scoreB = b.score ?? 1;
    return scoreA - scoreB;
  });

  // Return top N results
  return sorted.slice(0, limit).map((result) => result.item);
}

/**
 * Sort by score (lower is better) and return full scored array, optionally capped.
 * Use when merging results from multiple search functions for global ranking.
 */
export function sortByScore<T>(
  results: Array<{ item: T; score?: number }>,
  limit?: number
): Array<{ item: T; score: number }> {
  const sorted = [...results].sort((a, b) => {
    const scoreA = a.score ?? 1;
    const scoreB = b.score ?? 1;
    return scoreA - scoreB;
  });
  const capped = limit != null ? sorted.slice(0, limit) : sorted;
  return capped.map((r) => ({ item: r.item, score: r.score ?? 1 }));
}
