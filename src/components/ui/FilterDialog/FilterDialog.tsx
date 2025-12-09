"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string>;
}

export interface FilterField {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  gridCols?: number; // For grid layout (1-4)
}

export interface FilterConfig {
  moduleName: string; // Used for localStorage keys (e.g., "ticket", "project", "time-tracking")
  baseRoute: string; // Base route for navigation (e.g., "/dashboard/tickets")
  title: string;
  description: string;
  defaultSort: string;
  fields: FilterField[];
  defaultFilters: Record<string, string>;
  enablePresets?: boolean; // Default: true
  enableDateFilters?: boolean; // Default: true
}

interface FilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: FilterConfig;
}

const getStorageKey = (moduleName: string) => `${moduleName}-filter-presets`;
const getLastUsedKey = (moduleName: string) => `${moduleName}-filter-last-used-preset`;

export const FilterDialog = ({
  open,
  onOpenChange,
  config,
}: FilterDialogProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enablePresets = config.enablePresets !== false;
  const enableDateFilters = config.enableDateFilters !== false;

  // Get current filter values from URL
  const getCurrentFilters = React.useCallback(() => {
    const filters: Record<string, string> = { ...config.defaultFilters };
    config.fields.forEach((field) => {
      const value = searchParams.get(field.key);
      if (value !== null) {
        filters[field.key] = value;
      } else {
        filters[field.key] = config.defaultFilters[field.key] || "";
      }
    });
    // Include sort only if it's a field
    const hasSortField = config.fields.some((f) => f.key === "sort");
    if (hasSortField) {
      filters.sort = searchParams.get("sort") || config.defaultSort;
    }
    return filters;
  }, [searchParams, config]);

  const currentFilters = getCurrentFilters();

  // Local state for editing filters
  const [filters, setFilters] = React.useState(currentFilters);
  const [presetName, setPresetName] = React.useState("");
  const [savedPresets, setSavedPresets] = React.useState<FilterPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = React.useState<string>("");
  const [lastUsedPresetId, setLastUsedPresetId] = React.useState<string>("");

  const storageKey = getStorageKey(config.moduleName);
  const lastUsedKey = getLastUsedKey(config.moduleName);

  // Load saved presets and last used preset from localStorage
  React.useEffect(() => {
    if (!enablePresets) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const presets = JSON.parse(stored);
        setSavedPresets(presets);
      }

      const lastUsed = localStorage.getItem(lastUsedKey);
      if (lastUsed) {
        setLastUsedPresetId(lastUsed);
      }
    } catch (error) {
      console.error("Failed to load filter presets:", error);
    }
  }, [storageKey, lastUsedKey, enablePresets]);

  // Track if we're manually clearing to prevent auto-sync
  const isManuallyClearingRef = React.useRef(false);

  // Sync selected preset with current URL filters
  React.useEffect(() => {
    if (!enablePresets || savedPresets.length === 0) return;

    // Skip sync if we're manually clearing
    if (isManuallyClearingRef.current) {
      isManuallyClearingRef.current = false;
      return;
    }

    // Check if there are any active filters
    const hasActiveFilters = Object.entries(currentFilters).some(
      ([key, value]) => {
        const defaultValue = config.defaultFilters[key] || (key === "sort" ? config.defaultSort : "");
        return value && value !== defaultValue;
      }
    );

    if (!hasActiveFilters) {
      setSelectedPreset("");
      return;
    }

    // Check if current filters match any preset
    const matchingPreset = savedPresets.find((preset) => {
      return Object.keys(preset.filters).every((key) => {
        const presetValue = preset.filters[key] || "";
        const currentValue = currentFilters[key] || "";
        return presetValue === currentValue;
      });
    });

    if (matchingPreset) {
      setSelectedPreset(matchingPreset.id);
    } else {
      setSelectedPreset("");
    }
  }, [searchParams, savedPresets, currentFilters, config.defaultFilters, config.defaultSort, enablePresets]);

  // Update local filters when URL params change or dialog opens
  React.useEffect(() => {
    setFilters(getCurrentFilters());
  }, [searchParams, open, getCurrentFilters]);

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    // Skip sort if it's not a field
    if (key === "sort" && !config.fields.some((f) => f.key === "sort")) {
      return false;
    }
    const defaultValue = config.defaultFilters[key] || (key === "sort" ? config.defaultSort : "");
    return value && value !== defaultValue;
  });

  const updateFilters = (updates: Partial<typeof filters>) => {
    setFilters((prev) => {
      const result = { ...prev };
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    });
  };

  const applyFilters = () => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      // Skip sort if it's not a field (e.g., time tracking uses sortBy/sortOrder)
      if (key === "sort" && !config.fields.some((f) => f.key === "sort")) {
        return;
      }
      const defaultValue = config.defaultFilters[key] || (key === "sort" ? config.defaultSort : "");
      if (value && value !== defaultValue) {
        params.set(key, value);
      }
    });

    router.push(`${config.baseRoute}?${params.toString()}`);
    onOpenChange(false);
  };

  const clearFilters = () => {
    const clearedFilters = { ...config.defaultFilters };
    // Only include sort if it's a field
    if (config.fields.some((f) => f.key === "sort")) {
      clearedFilters.sort = config.defaultSort;
    }
    setFilters(clearedFilters);
    router.push(config.baseRoute);
    onOpenChange(false);
  };

  const applyPresetFilters = (presetFilters: Record<string, string>) => {
    const params = new URLSearchParams();
    Object.entries(presetFilters).forEach(([key, value]) => {
      // Skip sort if it's not a field
      if (key === "sort" && !config.fields.some((f) => f.key === "sort")) {
        return;
      }
      const defaultValue = config.defaultFilters[key] || (key === "sort" ? config.defaultSort : "");
      if (value && value !== defaultValue) {
        params.set(key, value);
      }
    });
    router.push(`${config.baseRoute}?${params.toString()}`);
  };

  const savePreset = () => {
    if (!presetName.trim() || !enablePresets) {
      return;
    }

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
    };

    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    setPresetName("");
    setSelectedPreset(newPreset.id);

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      localStorage.setItem(lastUsedKey, newPreset.id);
      setLastUsedPresetId(newPreset.id);
      window.dispatchEvent(new Event("localStorageChange"));
      applyPresetFilters(newPreset.filters);
    } catch (error) {
      console.error("Failed to save filter preset:", error);
    }
  };

  const loadPreset = (presetId: string) => {
    if (!enablePresets) return;

    // If clicking on the already selected preset, unselect it
    if (selectedPreset === presetId) {
      clearPreset();
      return;
    }

    const preset = savedPresets.find((p) => p.id === presetId);
    if (preset) {
      setFilters({ ...config.defaultFilters, ...preset.filters, sort: preset.filters.sort || config.defaultSort });
      setSelectedPreset(presetId);
      try {
        localStorage.setItem(lastUsedKey, presetId);
        setLastUsedPresetId(presetId);
        window.dispatchEvent(new Event("localStorageChange"));
      } catch (error) {
        console.error("Failed to save last used preset:", error);
      }
      applyPresetFilters(preset.filters);
    }
  };

  const clearPreset = () => {
    if (!enablePresets) return;

    isManuallyClearingRef.current = true;
    setSelectedPreset("");
    try {
      localStorage.removeItem(lastUsedKey);
      setLastUsedPresetId("");
      window.dispatchEvent(new Event("localStorageChange"));
    } catch (error) {
      console.error("Failed to clear last used preset:", error);
    }
    const clearedFilters = { ...config.defaultFilters };
    // Only include sort if it's a field
    if (config.fields.some((f) => f.key === "sort")) {
      clearedFilters.sort = config.defaultSort;
    }
    setFilters(clearedFilters);
    router.replace(config.baseRoute);
    onOpenChange(false);
  };

  const deletePreset = (presetId: string) => {
    if (!enablePresets) return;

    const updated = savedPresets.filter((p) => p.id !== presetId);
    setSavedPresets(updated);
    if (selectedPreset === presetId) {
      setSelectedPreset("");
    }
    if (lastUsedPresetId === presetId) {
      try {
        localStorage.removeItem(lastUsedKey);
        setLastUsedPresetId("");
        window.dispatchEvent(new Event("localStorageChange"));
      } catch (error) {
        console.error("Failed to clear last used preset:", error);
      }
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      window.dispatchEvent(new Event("localStorageChange"));
    } catch (error) {
      console.error("Failed to delete filter preset:", error);
    }
  };

  // Group fields by type for layout
  const selectFields = config.fields.filter((f) => f.type === "select");
  const dateFields = config.fields.filter((f) => f.type === "date");
  const textFields = config.fields.filter((f) => f.type === "text");

  // Get grid class based on number of columns
  const getGridClass = (cols: number) => {
    const gridClasses: Record<number, string> = {
      1: "grid-cols-1",
      2: "md:grid-cols-2",
      3: "md:grid-cols-3",
      4: "md:grid-cols-4",
    };
    return `grid grid-cols-1 ${gridClasses[cols] || gridClasses[2]}`;
  };

  // Calculate grid columns for select fields
  const selectGridCols = selectFields.length > 0 
    ? Math.min(selectFields[0].gridCols || 2, selectFields.length)
    : 2;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={config.title}
      description={config.description}
    >
      <div className="px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
        {/* Saved Presets */}
        {enablePresets && savedPresets.length > 0 && (
          <div className="border-b border-neutral-200 dark:border-neutral-700 pb-3 md:pb-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Saved Filter Presets
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedPreset && (
                <button
                  onClick={clearPreset}
                  className="px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-700 transition-colors"
                >
                  Clear Preset
                </button>
              )}
              {savedPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    selectedPreset === preset.id
                      ? "bg-primary-100 dark:bg-primary-900 border border-primary-300 dark:border-primary-700"
                      : "bg-neutral-100 dark:bg-neutral-800"
                  }`}
                >
                  <button
                    onClick={() => loadPreset(preset.id)}
                    className={`text-sm font-medium ${
                      selectedPreset === preset.id
                        ? "text-primary-700 dark:text-primary-300"
                        : "text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
                    }`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="text-neutral-400 dark:text-neutral-500 hover:text-error-600 dark:hover:text-error-400 transition-colors"
                    aria-label={`Delete preset ${preset.name}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Select Fields (Quick Filters) */}
        {selectFields.length > 0 && (
          <div className={getGridClass(selectGridCols) + " gap-3 md:gap-4"}>
            {selectFields.map((field) => (
              <Select
                key={`${field.key}-${filters[field.key]}`}
                label={field.label}
                options={field.options || []}
                defaultValue={filters[field.key] || ""}
                onChange={(e) => updateFilters({ [field.key]: e.target.value })}
              />
            ))}
          </div>
        )}

        {/* Text Fields */}
        {textFields.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {textFields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  {field.label}
                </label>
                <Input
                  type="text"
                  placeholder={field.placeholder || ""}
                  defaultValue={filters[field.key] || ""}
                  onBlur={(e) => {
                    if (e.target.value !== filters[field.key]) {
                      updateFilters({ [field.key]: e.target.value });
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Date Filters */}
        {enableDateFilters && dateFields.length > 0 && (
          <div className="space-y-3 md:space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Date Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {dateFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                    {field.label}
                  </label>
                  <Input
                    key={`${field.key}-${filters[field.key]}`}
                    type="date"
                    defaultValue={filters[field.key] || ""}
                    onBlur={(e) => {
                      if (e.target.value !== filters[field.key]) {
                        updateFilters({ [field.key]: e.target.value });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Preset */}
        {enablePresets && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 md:pt-4">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Save Current Filters as Preset
            </label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                type="text"
                placeholder="Enter preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    savePreset();
                  }
                }}
                className="flex-1 w-full sm:w-auto"
              />
              <Button
                variant="outline"
                onClick={savePreset}
                disabled={!presetName.trim()}
                className="px-6 w-full sm:w-auto"
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 md:pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium">
                Filters Active
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                Clear All
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button variant="primary" onClick={applyFilters} className="w-full sm:w-auto">
              Apply Filters
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
