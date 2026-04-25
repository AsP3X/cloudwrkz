import { api } from "@/api/client";
import type { SearchResult } from "./types";

// Human: Supporting module `recordSearchResultAccess` for global search UX and result handling: encapsulates logic helpers or small API utilities used by nearby components.
// Agent: SCOPE search; QUERY results preview; EXPORTS recordSearchResultAccess; TS module; SIDE_EFFECTS per implementation.
/** Records that the user opened this search result (boosts future ranking for the same query family). */
export function recordSearchResultAccess(result: Pick<SearchResult, "type" | "id">): void {
  void api
    .post("/search/access", {
      entityType: result.type,
      entityId: result.id,
    })
    .catch(() => {});
}
