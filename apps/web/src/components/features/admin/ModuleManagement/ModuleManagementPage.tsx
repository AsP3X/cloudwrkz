"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { setModuleEnabled } from "@/server/actions/modules";
import type { getAllModules } from "@/server/actions/modules";
import { cn } from "@/lib/utils/cn";

type Module = Awaited<ReturnType<typeof getAllModules>>[0];

interface ModuleManagementPageProps {
  initialModules: Module[];
}

type ViewMode = "card" | "list";
type FilterStatus = "all" | "enabled" | "disabled";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const STORAGE_KEY = "module-view-mode";

export function ModuleManagementPage({ initialModules }: ModuleManagementPageProps) {
  const router = useRouter();
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});
  const modules = useMemo(() => initialModules.map(m => m.key in pendingToggles ? { ...m, enabled: pendingToggles[m.key] } : m), [initialModules, pendingToggles]);
  const [loadingModules, setLoadingModules] = useState<Set<string>>(new Set());
  // Start with "card" to match server render, then update from localStorage after mount
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  // Load view mode from localStorage after mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "card" || stored === "list") {
        setViewMode(stored);
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }, []);

  // Save view mode to localStorage when it changes
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      // Ignore localStorage errors
    }
  };

  const handleToggle = async (moduleKey: string, enabled: boolean) => {
    setLoadingModules((prev) => new Set(prev).add(moduleKey));
    try {
      await setModuleEnabled(moduleKey as any, enabled);
      setPendingToggles((prev) => ({ ...prev, [moduleKey]: enabled }));
      router.refresh();
    } catch (error) {
      console.error("Failed to toggle module:", error);
    } finally {
      setLoadingModules((prev) => {
        const next = new Set(prev);
        next.delete(moduleKey);
        return next;
      });
    }
  };

  // Filter modules based on search and status
  const filteredModules = useMemo(() => {
    return modules.filter((module) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        module.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (module.description &&
          module.description.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && module.enabled) ||
        (statusFilter === "disabled" && !module.enabled);

      return matchesSearch && matchesStatus;
    });
  }, [modules, searchQuery, statusFilter]);

  const enabledCount = modules.filter((m) => m.enabled).length;
  const totalCount = modules.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Module Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Enable or disable system modules ({enabledCount} of {totalCount} enabled)
          </p>
        </div>
        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "card" ? "primary" : "outline"}
            size="sm"
            onClick={() => handleViewModeChange("card")}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
              />
            </svg>
            Card
          </Button>
          <Button
            variant={viewMode === "list" ? "primary" : "outline"}
            size="sm"
            onClick={() => handleViewModeChange("list")}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            List
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Search"
            placeholder="Search modules by name, key, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            label="Status"
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
          />
        </div>
        {filteredModules.length !== modules.length && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-4">
            Showing {filteredModules.length} of {modules.length} modules
          </p>
        )}
      </div>

      {/* Modules Display */}
      <div className={cn("transition-opacity duration-200", mounted ? "opacity-100" : "opacity-0")}>
      {viewMode === "card" ? (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModules.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="text-neutral-500 dark:text-neutral-400">No modules found matching your filters.</p>
            </div>
          ) : (
            filteredModules.map((module) => (
              <div
                key={module.id}
                className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                      {module.name}
                    </h3>
                    {module.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {module.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={module.enabled ? "success" : "default"} size="sm">
                    {module.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
                    {module.key}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={module.enabled}
                      onChange={(e) => handleToggle(module.key, e.target.checked)}
                      disabled={loadingModules.has(module.key)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-primary-600 dark:peer-checked:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* List/Table View */
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Module
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Key
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredModules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      No modules found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredModules.map((module) => (
                    <tr key={module.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {module.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                          {module.key}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">
                          {module.description || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={module.enabled ? "success" : "default"} size="sm">
                          {module.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={module.enabled}
                            onChange={(e) => handleToggle(module.key, e.target.checked)}
                            disabled={loadingModules.has(module.key)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-primary-600 dark:peer-checked:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                        </label>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
