"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FilterDialog, type FilterConfig } from "./FilterDialog";

interface FilterButtonProps {
  config: FilterConfig;
  activeFilterKeys?: string[]; // Optional: specify which keys indicate active filters
  defaultSort?: string; // Optional: override default sort for active check
}

export const FilterButton = ({ 
  config, 
  activeFilterKeys,
  defaultSort 
}: FilterButtonProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const sortToCheck = defaultSort || config.defaultSort;

  // Determine which filter keys to check
  const keysToCheck = activeFilterKeys || [
    ...config.fields.map((f) => f.key),
    "sort", // Include sort if it's a field
  ].filter((key) => key !== "sort" || config.fields.some((f) => f.key === "sort")); // Only include sort if it's actually a field

  // Check if any filters are active
  const hasActiveFilters = keysToCheck.some((key) => {
    const value = searchParams.get(key);
    if (key === "sort") {
      return value && value !== sortToCheck;
    }
    const defaultValue = config.defaultFilters[key] || "";
    return value && value !== defaultValue;
  });

  // Check if a preset is set (only if presets are enabled)
  const [hasPreset, setHasPreset] = React.useState(false);
  const enablePresets = config.enablePresets !== false;

  React.useEffect(() => {
    if (!enablePresets) {
      setHasPreset(false);
      return;
    }

    const checkPreset = () => {
      try {
        const lastUsedKey = `${config.moduleName}-filter-last-used-preset`;
        const storageKey = `${config.moduleName}-filter-presets`;
        const lastUsedId = localStorage.getItem(lastUsedKey);
        if (!lastUsedId) {
          setHasPreset(false);
          return;
        }

        const stored = localStorage.getItem(storageKey);
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

    checkPreset();

    const handleStorageChange = (e: StorageEvent) => {
      const lastUsedKey = `${config.moduleName}-filter-last-used-preset`;
      const storageKey = `${config.moduleName}-filter-presets`;
      if (e.key === lastUsedKey || e.key === storageKey) {
        checkPreset();
      }
    };

    if (typeof window === "undefined") return;

    window.addEventListener("storage", handleStorageChange);

    const handleCustomStorageChange = () => {
      checkPreset();
    };

    window.addEventListener("localStorageChange", handleCustomStorageChange);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("localStorageChange", handleCustomStorageChange);
      }
    };
  }, [config.moduleName, enablePresets]);

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

      <FilterDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        config={config}
      />
    </>
  );
};
