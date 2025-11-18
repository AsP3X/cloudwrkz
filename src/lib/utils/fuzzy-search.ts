import Fuse, { type IFuseOptions } from "fuse.js";

/**
 * Fuzzy search configuration options
 */
export interface FuzzySearchOptions<T> {
  keys: Array<keyof T | { name: keyof T; weight?: number }>;
  threshold?: number; // 0.0 = perfect match, 1.0 = match anything
  minMatchCharLength?: number;
  ignoreLocation?: boolean;
  includeScore?: boolean;
}

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
): Array<{ item: T; score?: number }> {
  if (!query || query.trim().length === 0) {
    return items.map((item) => ({ item }));
  }

  const searchTerm = query.trim();

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
    // Use extended search for better fuzzy matching
    useExtendedSearch: false,
    // Find all matches, not just the first
    findAllMatches: true,
  };

  const fuse = new Fuse(items, fuseOptions);
  const results = fuse.search(searchTerm);

  return results.map((result) => ({
    item: result.item,
    score: result.score,
  }));
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
