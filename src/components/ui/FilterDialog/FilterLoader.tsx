"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FilterConfig } from "./FilterDialog";

interface FilterLoaderProps {
  config: FilterConfig;
  enabled?: boolean; // Default: true
}

const getStorageKey = (moduleName: string) => `${moduleName}-filter-presets`;
const getLastUsedKey = (moduleName: string) => `${moduleName}-filter-last-used-preset`;

/**
 * Client component that automatically applies the last used filter preset
 * when accessing a page with filters
 */
export const FilterLoader = ({ config, enabled = true }: FilterLoaderProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply preset if enabled
    if (!enabled || !config.enablePresets) {
      return;
    }

    // Only apply preset once per mount
    if (hasAppliedRef.current) {
      return;
    }

    // Check if there are already filters in the URL
    const currentSearchParams = searchParams;
    const hasUrlFilters = Array.from(currentSearchParams.keys()).length > 0;
    if (hasUrlFilters) {
      hasAppliedRef.current = true;
      return; // Don't override existing filters
    }

    try {
      const storageKey = getStorageKey(config.moduleName);
      const lastUsedKey = getLastUsedKey(config.moduleName);

      // Load last used preset
      const lastUsedId = localStorage.getItem(lastUsedKey);
      if (!lastUsedId) {
        hasAppliedRef.current = true;
        return; // No preset to load
      }

      // Load presets
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        hasAppliedRef.current = true;
        return;
      }

      const presets = JSON.parse(stored);
      const preset = presets.find((p: { id: string }) => p.id === lastUsedId);
      
      if (!preset) {
        hasAppliedRef.current = true;
        return; // Preset not found
      }

      // Apply preset filters to URL
      const params = new URLSearchParams();
      Object.entries(preset.filters).forEach(([key, value]) => {
        if (value && typeof value === 'string' && value !== (config.defaultFilters[key] || config.defaultSort)) {
          params.set(key, value);
        }
      });

      // Only redirect if there are filters to apply
      if (params.toString()) {
        hasAppliedRef.current = true;
        router.replace(`${config.baseRoute}?${params.toString()}`);
      } else {
        hasAppliedRef.current = true;
      }
    } catch (error) {
      console.error("Failed to load filter preset:", error);
      hasAppliedRef.current = true;
    }
  }, [enabled, config, router]); // Removed searchParams from dependencies to prevent reload loops

  return null; // This component doesn't render anything
};
