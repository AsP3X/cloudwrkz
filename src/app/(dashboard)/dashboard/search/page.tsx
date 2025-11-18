import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { advancedSearch, type SearchFilters } from "@/server/actions/search";
import { SearchFilters as SearchFiltersComponent } from "@/components/features/search/SearchFilters";
import { SearchResultsTable } from "@/components/features/search/SearchResultsTable";
import { getAllUsers } from "@/server/actions/users";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    type?: string;
    assignedTo?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT")) {
    redirect(ROUTES.LOGIN);
  }

  // Get users for filter dropdown (only for agents/admins)
  const users = (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR")
    ? await getAllUsers()
    : [];

  // Build filters from search params
  const filters: SearchFilters = {
    query: params.q || "",
    status: params.status,
    priority: params.priority,
    type: params.type,
    assignedToId: params.assignedTo,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    updatedFrom: params.updatedFrom,
    updatedTo: params.updatedTo,
    sortBy: (params.sortBy as "createdAt" | "updatedAt") || "updatedAt",
    sortOrder: (params.sortOrder as "asc" | "desc") || "desc",
    limit: 100,
  };

  // Perform search only if there's a query or filters
  const hasQueryOrFilters = filters.query || filters.status || filters.priority || filters.type || 
    filters.assignedToId || filters.createdFrom || filters.createdTo || filters.updatedFrom || filters.updatedTo;
  
  const searchResults = hasQueryOrFilters 
    ? await advancedSearch(filters)
    : { results: [], total: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          Search
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Search across all tickets and modules
        </p>
      </div>

      {/* Search Filters */}
      <SearchFiltersComponent initialQuery={params.q || ""} users={users} isAgent={user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR"} />

      {/* Results Count */}
      {searchResults.results.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Found {searchResults.total} result{searchResults.total !== 1 ? "s" : ""}
        </div>
      )}

      {/* Search Results */}
      {searchResults.results.length === 0 ? (
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
            {params.q
              ? `No results found for "${params.q}". Try adjusting your search or filters.`
              : "Enter a search query to find tickets and other items."}
          </p>
        </div>
      ) : (
        <SearchResultsTable results={searchResults.results} searchQuery={params.q || ""} />
      )}
    </div>
  );
}
