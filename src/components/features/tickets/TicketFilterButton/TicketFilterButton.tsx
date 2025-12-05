"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TicketFilterDialog } from "@/components/features/tickets/TicketFilterDialog";

const LAST_USED_PRESET_KEY = "ticket-filter-last-used-preset";
const STORAGE_KEY = "ticket-filter-presets";

interface TicketFilterButtonProps {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  groups?: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  projects?: Array<{
    id: string;
    code: string;
    name: string;
    color: string | null;
  }>;
  isAgent: boolean;
}

export const TicketFilterButton = ({ users, groups = [], projects = [], isAgent }: TicketFilterButtonProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [hasPreset, setHasPreset] = React.useState(false);
  const searchParams = useSearchParams();

  // Check if any filters are active
  const sortParam = searchParams.get("sort");
  const hasActiveFilters =
    !!searchParams.get("status") ||
    !!searchParams.get("createdBy") ||
    !!searchParams.get("assignedToGroup") ||
    !!searchParams.get("projectId") ||
    !!searchParams.get("createdFrom") ||
    !!searchParams.get("createdTo") ||
    !!searchParams.get("updatedFrom") ||
    !!searchParams.get("updatedTo") ||
    (!!sortParam && sortParam !== "createdAt-desc");

  // Check if a preset is set (only for agents)
  React.useEffect(() => {
    if (!isAgent) {
      setHasPreset(false);
      return;
    }

    const checkPreset = () => {
      try {
        const lastUsedId = localStorage.getItem(LAST_USED_PRESET_KEY);
        if (!lastUsedId) {
          setHasPreset(false);
          return;
        }

        // Verify the preset actually exists
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setHasPreset(false);
          return;
        }

        const presets = JSON.parse(stored);
        const presetExists = presets.some((p: { id: string }) => p.id === lastUsedId);
        setHasPreset(presetExists);
      } catch (error) {
        setHasPreset(false);
      }
    };

    // Check initially
    checkPreset();

    // Listen for storage changes (when preset is added/removed)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LAST_USED_PRESET_KEY || e.key === STORAGE_KEY) {
        checkPreset();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also listen for custom events (for same-tab updates)
    const handleCustomStorageChange = () => {
      checkPreset();
    };

    window.addEventListener("localStorageChange", handleCustomStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("localStorageChange", handleCustomStorageChange);
    };
  }, [isAgent]);

  // Show badge if filters are active OR a preset is set
  const shouldShowBadge = hasActiveFilters || hasPreset;

  return (
    <>
      <Button
        variant={shouldShowBadge ? "primary" : "outline"}
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filters
        {shouldShowBadge && (
          <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
            Active
          </span>
        )}
      </Button>

      <TicketFilterDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        users={users}
        groups={groups}
        projects={projects}
        isAgent={isAgent}
      />
    </>
  );
};
