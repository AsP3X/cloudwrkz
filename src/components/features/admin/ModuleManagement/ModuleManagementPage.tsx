"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { setModuleEnabled } from "@/server/actions/modules";
import type { getAllModules } from "@/server/actions/modules";

type Module = Awaited<ReturnType<typeof getAllModules>>[0];

interface ModuleManagementPageProps {
  initialModules: Module[];
}

export function ModuleManagementPage({ initialModules }: ModuleManagementPageProps) {
  const router = useRouter();
  const [modules, setModules] = useState(initialModules);
  const [loadingModules, setLoadingModules] = useState<Set<string>>(new Set());

  const handleToggle = async (moduleKey: string, enabled: boolean) => {
    setLoadingModules((prev) => new Set(prev).add(moduleKey));
    try {
      await setModuleEnabled(moduleKey as any, enabled);
      setModules((prev) =>
        prev.map((m) => (m.key === moduleKey ? { ...m, enabled } : m))
      );
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Module Management</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Enable or disable system modules ({modules.filter((m) => m.enabled).length} enabled)
        </p>
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => (
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
        ))}
      </div>
    </div>
  );
}
