"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "UNRESOLVED", label: "Unresolved" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "QUESTION", label: "Question" },
  { value: "SUPPORT", label: "Support" },
  { value: "TASK", label: "Task" },
];

const SORT_OPTIONS = [
  { value: "updatedAt-desc", label: "Recently Updated" },
  { value: "updatedAt-asc", label: "Least Recently Updated" },
  { value: "createdAt-desc", label: "Newest First" },
  { value: "createdAt-asc", label: "Oldest First" },
];

interface SearchFiltersProps {
  initialQuery?: string;
  users?: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  isAgent?: boolean;
}

const EMPTY_USERS: NonNullable<SearchFiltersProps['users']> = [];

export const SearchFilters = (props: SearchFiltersProps) => {
  return (
    <Suspense fallback={null}>
      <SearchFiltersInner {...props} />
    </Suspense>
  );
};

const SearchFiltersInner = ({ initialQuery = "", users = EMPTY_USERS, isAgent = false }: SearchFiltersProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(initialQuery);
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Update query when searchParams change
  React.useEffect(() => {
    const q = searchParams.get("q") || "";
    setQuery(q);
  }, [searchParams]);

  const status = searchParams.get("status") || "";
  const priority = searchParams.get("priority") || "";
  const type = searchParams.get("type") || "";
  const assignedTo = searchParams.get("assignedTo") || "";
  const createdFrom = searchParams.get("createdFrom") || "";
  const createdTo = searchParams.get("createdTo") || "";
  const updatedFrom = searchParams.get("updatedFrom") || "";
  const updatedTo = searchParams.get("updatedTo") || "";
  const sort = searchParams.get("sortBy") && searchParams.get("sortOrder")
    ? `${searchParams.get("sortBy")}-${searchParams.get("sortOrder")}`
    : "updatedAt-desc";

  const userOptions = [
    { value: "", label: "All Users" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const hasActiveFilters =
    status ||
    priority ||
    type ||
    assignedTo ||
    createdFrom ||
    createdTo ||
    updatedFrom ||
    updatedTo ||
    sort !== "updatedAt-desc";

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.push(`/dashboard/search?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: query.trim() });
  };

  const clearFilters = () => {
    router.push("/dashboard/search");
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
      {/* Search Input */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={isAgent ? "Search tickets, users, time entries..." : "Search tickets, time entries..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Button type="submit" variant="primary">
            Search
          </Button>
        </div>
      </form>

      {/* Filters Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Filters</h2>
          {hasActiveFilters && (
            <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
            >
              Clear All
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
                Collapse
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                Expand
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick Filters - Always Visible */}
      <div className={`grid grid-cols-1 ${isAgent ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-4`}>
        <Select
          key={`status-${status}`}
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue={status}
          onChange={(e) => updateFilters({ status: e.target.value })}
        />
        <Select
          key={`priority-${priority}`}
          label="Priority"
          options={PRIORITY_OPTIONS}
          defaultValue={priority}
          onChange={(e) => updateFilters({ priority: e.target.value })}
        />
        <Select
          key={`type-${type}`}
          label="Type"
          options={TYPE_OPTIONS}
          defaultValue={type}
          onChange={(e) => updateFilters({ type: e.target.value })}
        />
        {isAgent && (
          <Select
            key={`assignedTo-${assignedTo}`}
            label="Assigned To"
            options={userOptions}
            defaultValue={assignedTo}
            onChange={(e) => updateFilters({ assignedTo: e.target.value })}
          />
        )}
        <Select
          key={`sort-${sort}`}
          label="Sort By"
          options={SORT_OPTIONS}
          defaultValue={sort}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split("-");
            updateFilters({ sortBy, sortOrder });
          }}
        />
      </div>

      {/* Advanced Filters - Expandable */}
      {isExpanded && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="search-created-from" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Created From
              </label>
              <Input
                id="search-created-from"
                key={`createdFrom-${createdFrom}`}
                type="date"
                defaultValue={createdFrom}
                onBlur={(e) => {
                  if (e.target.value !== createdFrom) {
                    updateFilters({ createdFrom: e.target.value });
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="search-created-to" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Created To
              </label>
              <Input
                id="search-created-to"
                key={`createdTo-${createdTo}`}
                type="date"
                defaultValue={createdTo}
                onBlur={(e) => {
                  if (e.target.value !== createdTo) {
                    updateFilters({ createdTo: e.target.value });
                  }
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="search-updated-from" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Last Modified From
              </label>
              <Input
                id="search-updated-from"
                key={`updatedFrom-${updatedFrom}`}
                type="date"
                defaultValue={updatedFrom}
                onBlur={(e) => {
                  if (e.target.value !== updatedFrom) {
                    updateFilters({ updatedFrom: e.target.value });
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="search-updated-to" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Last Modified To
              </label>
              <Input
                id="search-updated-to"
                key={`updatedTo-${updatedTo}`}
                type="date"
                defaultValue={updatedTo}
                onBlur={(e) => {
                  if (e.target.value !== updatedTo) {
                    updateFilters({ updatedTo: e.target.value });
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
