import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { SearchFilters } from "@/components/features/search/SearchFilters";
import { SearchResultsTable } from "@/components/features/search/SearchResultsTable";
import type { SearchResult } from "@/components/features/search/types";
import { hasAgentCapabilities } from "@/lib/permissions";

// Human: Global search surface combining text query parameters, agent-only user filters, and grouped result tables.
// Agent: READS searchParams q; CONDITIONAL GET /admin/users for agents; POST/GET search endpoint via performSearch.

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

// Human: Coordinates debounced or param-driven searches and renders filter chips plus the results data grid.
// Agent: STATE results,total,loading,users; useCallback performSearch; READS isAgent from user.role.

export default function SearchPage() {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserSummary[]>([]);

  const isAgent = hasAgentCapabilities(can);
  const query = searchParams.get("q") || "";

  useEffect(() => {
    if (isAgent) {
      api.get<{ users: UserSummary[] }>("/admin/users").then((data) => {
        setUsers(data.users || []);
      }).catch(() => {});
    }
  }, [isAgent]);

  const performSearch = useCallback(async () => {
    const q = searchParams.get("q") || "";
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const type = searchParams.get("type") || "";
    const assignedTo = searchParams.get("assignedTo") || "";
    const createdFrom = searchParams.get("createdFrom") || "";
    const createdTo = searchParams.get("createdTo") || "";
    const updatedFrom = searchParams.get("updatedFrom") || "";
    const updatedTo = searchParams.get("updatedTo") || "";
    const sortBy = searchParams.get("sortBy") || "updatedAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const hasQueryOrFilters = q || status || priority || type || assignedTo || createdFrom || createdTo || updatedFrom || updatedTo;
    if (!hasQueryOrFilters) {
      setResults([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (type) params.set("type", type);
      if (assignedTo) params.set("assignedTo", assignedTo);
      if (createdFrom) params.set("createdFrom", createdFrom);
      if (createdTo) params.set("createdTo", createdTo);
      if (updatedFrom) params.set("updatedFrom", updatedFrom);
      if (updatedTo) params.set("updatedTo", updatedTo);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("limit", "100");

      const data = await api.get<{ results: SearchResult[]; total: number }>(`/search/advanced?${params.toString()}`);
      setResults(data.results || []);
      setTotal(data.total ?? 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { performSearch(); }, [performSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          Search
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Search across tickets, users, and time entries
        </p>
      </div>

      <SearchFilters initialQuery={query} users={users} isAgent={isAgent} />

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      )}

      {!loading && total > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Found {total} result{total !== 1 ? "s" : ""}
        </div>
      )}

      {!loading && results.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No results found
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            {query
              ? `No results found for "${query}". Try adjusting your search or filters.`
              : "Enter a search query to find tickets and other items."}
          </p>
        </div>
      ) : !loading && results.length > 0 ? (
        <SearchResultsTable results={results} searchQuery={query} />
      ) : null}
    </div>
  );
}
