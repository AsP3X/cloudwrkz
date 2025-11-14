"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TicketFilterDialog } from "@/components/features/tickets/TicketFilterDialog";

interface TicketFilterButtonProps {
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  isAgent: boolean;
}

export const TicketFilterButton = ({ users, isAgent }: TicketFilterButtonProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const searchParams = useSearchParams();

  // Check if any filters are active
  const hasActiveFilters =
    searchParams.get("status") ||
    searchParams.get("createdBy") ||
    searchParams.get("createdFrom") ||
    searchParams.get("createdTo") ||
    searchParams.get("updatedFrom") ||
    searchParams.get("updatedTo") ||
    searchParams.get("sort") !== "createdAt-desc";

  return (
    <>
      <Button
        variant={hasActiveFilters ? "primary" : "outline"}
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
        {hasActiveFilters && (
          <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
            Active
          </span>
        )}
      </Button>

      <TicketFilterDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        users={users}
        isAgent={isAgent}
      />
    </>
  );
};
