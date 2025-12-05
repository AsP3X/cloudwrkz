"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const SORT_OPTIONS = [
  { value: "createdAt-desc", label: "Newest First" },
  { value: "createdAt-asc", label: "Oldest First" },
  { value: "updatedAt-desc", label: "Recently Updated" },
  { value: "updatedAt-asc", label: "Least Recently Updated" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

interface ProjectFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProjectFilterDialog = ({
  open,
  onOpenChange,
}: ProjectFilterDialogProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Current filter values from URL
  const currentFilters = {
    status: searchParams.get("status") || "",
    priority: searchParams.get("priority") || "",
    createdFrom: searchParams.get("createdFrom") || "",
    createdTo: searchParams.get("createdTo") || "",
    updatedFrom: searchParams.get("updatedFrom") || "",
    updatedTo: searchParams.get("updatedTo") || "",
    sort: searchParams.get("sort") || "createdAt-desc",
  };

  // Local state for editing filters
  const [filters, setFilters] = React.useState(currentFilters);

  // Update local filters when URL params change or dialog opens
  React.useEffect(() => {
    setFilters(currentFilters);
  }, [searchParams, open]);

  const hasActiveFilters =
    filters.status ||
    filters.priority ||
    filters.createdFrom ||
    filters.createdTo ||
    filters.updatedFrom ||
    filters.updatedTo ||
    filters.sort !== "createdAt-desc";

  const updateFilters = (updates: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const applyFilters = () => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    router.push(`/dashboard/projects?${params.toString()}`);
    onOpenChange(false);
  };

  const clearFilters = () => {
    setFilters({
      status: "",
      priority: "",
      createdFrom: "",
      createdTo: "",
      updatedFrom: "",
      updatedTo: "",
      sort: "createdAt-desc",
    });
    router.push("/dashboard/projects");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filter Projects"
      description="Filter projects by status, priority, and date ranges"
    >
      <div className="px-6 py-6 space-y-6">
        {/* Quick Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            key={`status-${filters.status}`}
            label="Status"
            options={STATUS_OPTIONS}
            defaultValue={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value })}
          />
          <Select
            key={`priority-${filters.priority}`}
            label="Priority"
            options={PRIORITY_OPTIONS}
            defaultValue={filters.priority}
            onChange={(e) => updateFilters({ priority: e.target.value })}
          />
          <Select
            key={`sort-${filters.sort}`}
            label="Sort By"
            options={SORT_OPTIONS}
            defaultValue={filters.sort}
            onChange={(e) => updateFilters({ sort: e.target.value })}
          />
        </div>

        {/* Date Filters */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Date Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Created From
              </label>
              <Input
                key={`createdFrom-${filters.createdFrom}`}
                type="date"
                defaultValue={filters.createdFrom}
                onBlur={(e) => {
                  if (e.target.value !== filters.createdFrom) {
                    updateFilters({ createdFrom: e.target.value });
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Created To
              </label>
              <Input
                key={`createdTo-${filters.createdTo}`}
                type="date"
                defaultValue={filters.createdTo}
                onBlur={(e) => {
                  if (e.target.value !== filters.createdTo) {
                    updateFilters({ createdTo: e.target.value });
                  }
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Last Modified From
              </label>
              <Input
                key={`updatedFrom-${filters.updatedFrom}`}
                type="date"
                defaultValue={filters.updatedFrom}
                onBlur={(e) => {
                  if (e.target.value !== filters.updatedFrom) {
                    updateFilters({ updatedFrom: e.target.value });
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Last Modified To
              </label>
              <Input
                key={`updatedTo-${filters.updatedTo}`}
                type="date"
                defaultValue={filters.updatedTo}
                onBlur={(e) => {
                  if (e.target.value !== filters.updatedTo) {
                    updateFilters({ updatedTo: e.target.value });
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                Filters Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Clear All
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={applyFilters}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
