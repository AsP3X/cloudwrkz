import { api } from "@/api/client";
import type { SearchResult } from "./types";

/** Records that the user opened this search result (boosts future ranking for the same query family). */
export function recordSearchResultAccess(result: Pick<SearchResult, "type" | "id">): void {
  void api
    .post("/search/access", {
      entityType: result.type,
      entityId: result.id,
    })
    .catch(() => {});
}
