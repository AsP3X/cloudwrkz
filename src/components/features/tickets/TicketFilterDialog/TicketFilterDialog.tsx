"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "UNRESOLVED", label: "Unresolved" },
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

interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string>;
}

interface TicketFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  isAgent: boolean;
}

const STORAGE_KEY = "ticket-filter-presets";
const LAST_USED_PRESET_KEY = "ticket-filter-last-used-preset";

export const TicketFilterDialog = ({
  open,
  onOpenChange,
  users,
  groups = [],
  isAgent,
}: TicketFilterDialogProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Current filter values from URL
  const currentFilters = {
    status: searchParams.get("status") || "",
    createdBy: searchParams.get("createdBy") || "",
    assignedToGroup: searchParams.get("assignedToGroup") || "",
    createdFrom: searchParams.get("createdFrom") || "",
    createdTo: searchParams.get("createdTo") || "",
    updatedFrom: searchParams.get("updatedFrom") || "",
    updatedTo: searchParams.get("updatedTo") || "",
    sort: searchParams.get("sort") || "createdAt-desc",
  };

  // Local state for editing filters
  const [filters, setFilters] = React.useState(currentFilters);
  const [presetName, setPresetName] = React.useState("");
  const [savedPresets, setSavedPresets] = React.useState<FilterPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = React.useState<string>("");
  const [lastUsedPresetId, setLastUsedPresetId] = React.useState<string>("");

  // Load saved presets and last used preset from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const presets = JSON.parse(stored);
        setSavedPresets(presets);
      }

      const lastUsed = localStorage.getItem(LAST_USED_PRESET_KEY);
      if (lastUsed) {
        setLastUsedPresetId(lastUsed);
      }
    } catch (error) {
      console.error("Failed to load filter presets:", error);
    }
  }, []);

  // Track if we're manually clearing to prevent auto-sync
  const isManuallyClearingRef = React.useRef(false);

  // Sync selected preset with current URL filters (only if not manually clearing)
  React.useEffect(() => {
    // Skip sync if we're manually clearing
    if (isManuallyClearingRef.current) {
      isManuallyClearingRef.current = false;
      return;
    }

    if (savedPresets.length > 0) {
      // Check if there are any active filters
      const hasActiveFilters = Object.values(currentFilters).some(
        (value) => value && value !== "createdAt-desc"
      );

      if (!hasActiveFilters) {
        // No active filters, clear selection
        setSelectedPreset("");
        return;
      }

      // Check if current filters match any preset
      const matchingPreset = savedPresets.find((preset) => {
        return Object.keys(preset.filters).every((key) => {
          const presetValue = preset.filters[key] || "";
          const currentValue = currentFilters[key as keyof typeof currentFilters] || "";
          return presetValue === currentValue;
        });
      });
      
      if (matchingPreset) {
        setSelectedPreset(matchingPreset.id);
      } else {
        setSelectedPreset("");
      }
    }
  }, [searchParams, savedPresets, currentFilters]);

  // Update local filters when URL params change
  React.useEffect(() => {
    setFilters(currentFilters);
  }, [searchParams]);

  const userOptions = [
    { value: "", label: "All Users" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const groupOptions = [
    { value: "", label: "All Groups" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];

  const hasActiveFilters =
    filters.status ||
    filters.createdBy ||
    filters.assignedToGroup ||
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

    router.push(`/dashboard/tickets?${params.toString()}`);
    onOpenChange(false);
  };

  const clearFilters = () => {
    setFilters({
      status: "",
      createdBy: "",
      assignedToGroup: "",
      createdFrom: "",
      createdTo: "",
      updatedFrom: "",
      updatedTo: "",
      sort: "createdAt-desc",
    });
    router.push("/dashboard/tickets");
    onOpenChange(false);
  };

  const applyPresetFilters = (presetFilters: Record<string, string>) => {
    const params = new URLSearchParams();
    Object.entries(presetFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    router.push(`/dashboard/tickets?${params.toString()}`);
  };

  const savePreset = () => {
    if (!presetName.trim()) {
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Mark this preset as the last used
      localStorage.setItem(LAST_USED_PRESET_KEY, newPreset.id);
      setLastUsedPresetId(newPreset.id);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event("localStorageChange"));
      // Immediately apply the preset filters
      applyPresetFilters(newPreset.filters);
    } catch (error) {
      console.error("Failed to save filter preset:", error);
    }
  };

  const loadPreset = (presetId: string) => {
    // If clicking on the already selected preset, unselect it
    if (selectedPreset === presetId) {
      clearPreset();
      return;
    }

    const preset = savedPresets.find((p) => p.id === presetId);
    if (preset) {
      setFilters({
        status: preset.filters.status || "",
        createdBy: preset.filters.createdBy || "",
        assignedToGroup: preset.filters.assignedToGroup || "",
        createdFrom: preset.filters.createdFrom || "",
        createdTo: preset.filters.createdTo || "",
        updatedFrom: preset.filters.updatedFrom || "",
        updatedTo: preset.filters.updatedTo || "",
        sort: preset.filters.sort || "createdAt-desc",
      });
      setSelectedPreset(presetId);
      // Mark this preset as the last used
      try {
        localStorage.setItem(LAST_USED_PRESET_KEY, presetId);
        setLastUsedPresetId(presetId);
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event("localStorageChange"));
      } catch (error) {
        console.error("Failed to save last used preset:", error);
      }
      // Immediately apply the preset filters
      applyPresetFilters(preset.filters);
    }
  };

  const clearPreset = () => {
    // Set flag to prevent sync effect from re-selecting
    isManuallyClearingRef.current = true;
    setSelectedPreset("");
    // Clear the last used preset
    try {
      localStorage.removeItem(LAST_USED_PRESET_KEY);
      setLastUsedPresetId("");
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event("localStorageChange"));
    } catch (error) {
      console.error("Failed to clear last used preset:", error);
    }
    // Clear filters and navigate to base tickets page
    const clearedFilters = {
      status: "",
      createdBy: "",
      assignedToGroup: "",
      createdFrom: "",
      createdTo: "",
      updatedFrom: "",
      updatedTo: "",
      sort: "createdAt-desc",
    };
    setFilters(clearedFilters);
    router.replace("/dashboard/tickets");
    // Close the dialog to prevent sync effect interference
    onOpenChange(false);
  };

  const deletePreset = (presetId: string) => {
    const updated = savedPresets.filter((p) => p.id !== presetId);
    setSavedPresets(updated);
    if (selectedPreset === presetId) {
      setSelectedPreset("");
    }
    // If deleting the last used preset, clear it
    if (lastUsedPresetId === presetId) {
      try {
        localStorage.removeItem(LAST_USED_PRESET_KEY);
        setLastUsedPresetId("");
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event("localStorageChange"));
      } catch (error) {
        console.error("Failed to clear last used preset:", error);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Dispatch custom event to notify other components (preset list changed)
      window.dispatchEvent(new Event("localStorageChange"));
    } catch (error) {
      console.error("Failed to delete filter preset:", error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filter Tickets"
      description="Create, edit, and save filter presets to quickly find tickets"
    >
      <div className="px-6 py-6 space-y-6">
        {/* Saved Presets */}
        {savedPresets.length > 0 && (
          <div className="border-b border-neutral-200 pb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Saved Filter Presets
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedPreset && (
                <button
                  onClick={clearPreset}
                  className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 rounded-lg border border-neutral-200 transition-colors"
                >
                  Clear Preset
                </button>
              )}
              {savedPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    selectedPreset === preset.id
                      ? "bg-primary-100 border border-primary-300"
                      : "bg-neutral-100"
                  }`}
                >
                  <button
                    onClick={() => loadPreset(preset.id)}
                    className={`text-sm font-medium ${
                      selectedPreset === preset.id
                        ? "text-primary-700"
                        : "text-neutral-700 hover:text-primary-600"
                    }`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="text-neutral-400 hover:text-error-600 transition-colors"
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

        {/* Quick Filters */}
        <div className={`grid grid-cols-1 ${isAgent ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-4`}>
          <Select
            key={`status-${filters.status}`}
            label="Status"
            options={STATUS_OPTIONS}
            defaultValue={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value })}
          />
          <Select
            key={`sort-${filters.sort}`}
            label="Sort By"
            options={SORT_OPTIONS}
            defaultValue={filters.sort}
            onChange={(e) => updateFilters({ sort: e.target.value })}
          />
        </div>
        {isAgent && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              key={`user-${filters.createdBy}`}
              label="Created By"
              options={userOptions}
              defaultValue={filters.createdBy}
              onChange={(e) => updateFilters({ createdBy: e.target.value })}
            />
            {groups.length > 0 && (
              <Select
                key={`group-${filters.assignedToGroup}`}
                label="Assigned To Group"
                options={groupOptions}
                defaultValue={filters.assignedToGroup}
                onChange={(e) => updateFilters({ assignedToGroup: e.target.value })}
              />
            )}
          </div>
        )}

        {/* Date Filters */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Date Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
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
              <label className="block text-sm font-medium text-neutral-700 mb-2">
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

        {/* Save Preset */}
        <div className="border-t border-neutral-200 pt-4">
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Save Current Filters as Preset
          </label>
          <div className="flex gap-2">
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
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={savePreset}
              disabled={!presetName.trim()}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
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
