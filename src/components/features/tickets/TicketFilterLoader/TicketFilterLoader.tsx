"use client";

import { useEffect, useRef } from "react";
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
  const hasAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply preset for agents
    if (!isAgent) {
      return;
    }

    // Only apply preset once per mount
    if (hasAppliedRef.current) {
      return;
    }

    // Check if there are already filters in the URL (read synchronously at effect start)
    const currentSearchParams = searchParams;
    const hasUrlFilters = Array.from(currentSearchParams.keys()).length > 0;
    if (hasUrlFilters) {
      hasAppliedRef.current = true;
      return; // Don't override existing filters
    }

    try {
      // Load last used preset
      const lastUsedId = localStorage.getItem(LAST_USED_PRESET_KEY);
      if (!lastUsedId) {
        hasAppliedRef.current = true;
        return; // No preset to load
      }

      // Load presets
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        hasAppliedRef.current = true;
        return;
      }

      const presets: FilterPreset[] = JSON.parse(stored);
      const preset = presets.find((p) => p.id === lastUsedId);
      
      if (!preset) {
        hasAppliedRef.current = true;
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
        hasAppliedRef.current = true;
        router.replace(`/dashboard/tickets?${params.toString()}`);
      } else {
        hasAppliedRef.current = true;
      }
    } catch (error) {
      console.error("Failed to load filter preset:", error);
      hasAppliedRef.current = true;
    }
    // Note: searchParams is intentionally NOT in dependencies to prevent infinite loops
    // We read it synchronously at the start of the effect, which is safe
  }, [isAgent, router]); // Removed searchParams from dependencies to prevent reload loops

  return null; // This component doesn't render anything
};
