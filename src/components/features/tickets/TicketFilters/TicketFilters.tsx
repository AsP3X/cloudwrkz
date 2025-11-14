"use client";

import React from "react";
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
];

const SORT_OPTIONS = [
  { value: "createdAt-desc", label: "Newest First" },
  { value: "createdAt-asc", label: "Oldest First" },
  { value: "updatedAt-desc", label: "Recently Updated" },
  { value: "updatedAt-asc", label: "Least Recently Updated" },
];

interface TicketFiltersProps {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  isAgent: boolean;
}

export const TicketFilters = ({ users, isAgent }: TicketFiltersProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const status = searchParams.get("status") || "";
  const createdById = searchParams.get("createdBy") || "";
  const createdFrom = searchParams.get("createdFrom") || "";
  const createdTo = searchParams.get("createdTo") || "";
  const updatedFrom = searchParams.get("updatedFrom") || "";
  const updatedTo = searchParams.get("updatedTo") || "";
  const sort = searchParams.get("sort") || "createdAt-desc";

  const userOptions = [
    { value: "", label: "All Users" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const hasActiveFilters =
    status ||
    createdById ||
    createdFrom ||
    createdTo ||
    updatedFrom ||
    updatedTo ||
    sort !== "createdAt-desc";

  const updateFilters = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.push(`/dashboard/tickets?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("/dashboard/tickets");
  };

  const [sortBy, sortOrder] = sort.split("-");

  return (
    <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-neutral-900">Filters</h2>
          {hasActiveFilters && (
            <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
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
      <div className={`grid grid-cols-1 ${isAgent ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mb-4`}>
        <Select
          key={`status-${status}`}
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue={status}
          onChange={(e) => updateFilters({ status: e.target.value })}
        />
        <Select
          key={`sort-${sort}`}
          label="Sort By"
          options={SORT_OPTIONS}
          defaultValue={sort}
          onChange={(e) => updateFilters({ sort: e.target.value })}
        />
        {isAgent && (
          <Select
            key={`user-${createdById}`}
            label="Created By"
            options={userOptions}
            defaultValue={createdById}
            onChange={(e) => updateFilters({ createdBy: e.target.value })}
          />
        )}
      </div>

      {/* Advanced Filters - Expandable */}
      {isExpanded && (
        <div className="border-t border-neutral-200 pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Created From
              </label>
              <Input
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Created To
              </label>
              <Input
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Last Modified From
              </label>
              <Input
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Last Modified To
              </label>
              <Input
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
