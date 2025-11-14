"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "ticket-filter-presets";
const LAST_USED_PRESET_KEY = "ticket-filter-last-used-preset";

interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string>;
}

interface TicketFilterLoaderProps {
  isAgent: boolean;
}

/**
 * Client component that automatically applies the last used filter preset
 * when the agent accesses the ticket overview page
 */
export const TicketFilterLoader = ({ isAgent }: TicketFilterLoaderProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Only apply preset for agents
    if (!isAgent) {
      return;
    }

    // Check if there are already filters in the URL
    const hasUrlFilters = Array.from(searchParams.keys()).length > 0;
    if (hasUrlFilters) {
      return; // Don't override existing filters
    }

    try {
      // Load last used preset
      const lastUsedId = localStorage.getItem(LAST_USED_PRESET_KEY);
      if (!lastUsedId) {
        return; // No preset to load
      }

      // Load presets
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }

      const presets: FilterPreset[] = JSON.parse(stored);
      const preset = presets.find((p) => p.id === lastUsedId);
      
      if (!preset) {
        return; // Preset not found
      }

      // Apply preset filters to URL
      const params = new URLSearchParams();
      Object.entries(preset.filters).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        }
      });

      // Only redirect if there are filters to apply
      if (params.toString()) {
        router.replace(`/dashboard/tickets?${params.toString()}`);
      }
    } catch (error) {
      console.error("Failed to load filter preset:", error);
    }
  }, [isAgent, router, searchParams]);

  return null; // This component doesn't render anything
};
