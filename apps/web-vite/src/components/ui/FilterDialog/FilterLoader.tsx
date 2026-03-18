import { Suspense, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FilterConfig } from "./FilterDialog";
import { api } from "@/api/client";

interface FilterLoaderProps {
  config: FilterConfig;
  enabled?: boolean; // Default: true
}

const getStorageKey = (moduleName: string) => `${moduleName}-filter-presets`;
const getLastUsedKey = (moduleName: string) => `${moduleName}-filter-last-used-preset`;

/**
 * Client component that automatically applies the last used filter preset
 * when accessing a page with filters. Loads from backend for cross-device persistence.
 */
export const FilterLoader = (props: FilterLoaderProps) => {
  return (
    <Suspense fallback={null}>
      <FilterLoaderInner {...props} />
    </Suspense>
  );
};

const FilterLoaderInner = ({ config, enabled = true }: FilterLoaderProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasAppliedRef = useRef(false);

  useEffect(() => {
    // Only apply preset if enabled
    if (!enabled) {
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

    const loadFilters = async () => {
      try {
        // Check backend for saved filter preferences
        let filtersToApply: Record<string, string> | null = null;

        try {
          const backendResult = await api.get<Record<string, string> | { filters?: Record<string, string>; currentFilters?: Record<string, string> }>(
            `/filter-preferences/${config.moduleName}`
          );
          // Handle various API response shapes
          let rawFilters: Record<string, string> | null = null;
          if (backendResult && typeof backendResult === "object" && !Array.isArray(backendResult)) {
            if ("filters" in backendResult && backendResult.filters && typeof backendResult.filters === "object") {
              rawFilters = backendResult.filters;
            } else if ("currentFilters" in backendResult && backendResult.currentFilters && typeof backendResult.currentFilters === "object") {
              rawFilters = backendResult.currentFilters;
            } else {
              rawFilters = backendResult as Record<string, string>;
            }
          }
          if (rawFilters && Object.keys(rawFilters).length > 0) {
            filtersToApply = rawFilters;

            // Sync with localStorage: update if different
            try {
              const storageKey = getStorageKey(config.moduleName);
              const lastUsedKey = getLastUsedKey(config.moduleName);
              const lastUsedId = localStorage.getItem(lastUsedKey);

              if (lastUsedId && config.enablePresets) {
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                  const presets = JSON.parse(stored);
                  const preset = presets.find((p: { id: string }) => p.id === lastUsedId);

                  if (preset) {
                    const presetFilters = preset.filters || {};
                    const backendChanged = JSON.stringify(filtersToApply) !== JSON.stringify(presetFilters);

                    if (backendChanged) {
                      preset.filters = { ...filtersToApply };
                      localStorage.setItem(storageKey, JSON.stringify(presets));
                    }
                  }
                }
              }
            } catch (localError) {
              console.warn("Failed to sync localStorage:", localError);
            }
          }
        } catch (backendError) {
          // API may not exist - fall back to localStorage
        }

        // No backend filters, check localStorage
        if (!filtersToApply && config.enablePresets) {
          const storageKey = getStorageKey(config.moduleName);
          const lastUsedKey = getLastUsedKey(config.moduleName);

          const lastUsedId = localStorage.getItem(lastUsedKey);
          if (!lastUsedId) {
            hasAppliedRef.current = true;
            return;
          }

          const stored = localStorage.getItem(storageKey);
          if (!stored) {
            hasAppliedRef.current = true;
            return;
          }

          const presets = JSON.parse(stored);
          const preset = presets.find((p: { id: string }) => p.id === lastUsedId);

          if (!preset) {
            hasAppliedRef.current = true;
            return;
          }

          filtersToApply = preset.filters || {};
        }

        // Apply filters to URL if we have any
        if (filtersToApply) {
          const params = new URLSearchParams();
          Object.entries(filtersToApply).forEach(([key, value]) => {
            if (value && typeof value === "string" && value !== (config.defaultFilters[key] || config.defaultSort)) {
              params.set(key, value);
            }
          });

          if (params.toString()) {
            hasAppliedRef.current = true;
            navigate(`${config.baseRoute}?${params.toString()}`, { replace: true });
          } else {
            hasAppliedRef.current = true;
          }
        } else {
          hasAppliedRef.current = true;
        }
      } catch (error) {
        console.error("Failed to load filter preferences:", error);
        hasAppliedRef.current = true;
      }
    };

    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, config, navigate]);

  return null; // This component doesn't render anything
};
