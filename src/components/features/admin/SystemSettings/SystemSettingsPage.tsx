"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { purgeDeletedAccounts, updateLinksDefaultPageSize } from "@/server/actions/admin/settings";
import { LINKS_DEFAULT_PAGE_SIZE_VALUES, LINK_PAGE_SIZE_ALL } from "@/lib/constants/links";
import type {
  getSystemInfo,
  getDatabaseStats,
  getSystemHealth,
  getLinksDefaultPageSize,
} from "@/server/actions/admin/settings";

interface SystemSettingsPageProps {
  systemInfo: Awaited<ReturnType<typeof getSystemInfo>>;
  databaseStats: Awaited<ReturnType<typeof getDatabaseStats>>;
  health: Awaited<ReturnType<typeof getSystemHealth>>;
  linksDefaultPageSize: Awaited<ReturnType<typeof getLinksDefaultPageSize>>;
}

export function SystemSettingsPage({
  systemInfo,
  databaseStats,
  health,
  linksDefaultPageSize: initialLinksDefaultPageSize,
}: SystemSettingsPageProps) {
  const router = useRouter();
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ message: string; deletedCount: number } | null>(null);
  const [linksDefaultPageSize, setLinksDefaultPageSize] = useState(initialLinksDefaultPageSize);
  const [linksPageSizeSaving, setLinksPageSizeSaving] = useState(false);
  const [linksPageSizeMessage, setLinksPageSizeMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLinksDefaultPageSizeSave = async () => {
    setLinksPageSizeSaving(true);
    setLinksPageSizeMessage(null);
    try {
      const result = await updateLinksDefaultPageSize(linksDefaultPageSize);
      if (result.success) {
        setLinksPageSizeMessage({ type: "success", text: "Links default page size saved." });
        router.refresh();
      } else {
        setLinksPageSizeMessage({ type: "error", text: result.error ?? "Failed to save." });
      }
    } catch {
      setLinksPageSizeMessage({ type: "error", text: "Failed to save." });
    } finally {
      setLinksPageSizeSaving(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm("Are you sure you want to purge deleted accounts? This action cannot be undone.")) {
      return;
    }

    setIsPurging(true);
    setPurgeResult(null);
    try {
      const result = await purgeDeletedAccounts();
      setPurgeResult(result);
      router.refresh();
    } catch (error) {
      console.error("Purge error:", error);
    } finally {
      setIsPurging(false);
    }
  };

  const getHealthBadgeVariant = () => {
    switch (health.status) {
      case "healthy":
        return "success";
      case "degraded":
        return "warning";
      case "unhealthy":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">System Settings</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          System information and configuration
        </p>
      </div>

      {/* System Health */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">System Health</h2>
          <Badge variant={getHealthBadgeVariant()} size="md">
            {health.status.toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{health.message}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${health.checks.database ? "bg-success-500" : "bg-error-500"}`} />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">Database</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${health.checks.sessions ? "bg-success-500" : "bg-error-500"}`} />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">Sessions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${health.checks.modules ? "bg-success-500" : "bg-error-500"}`} />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">Modules</span>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">System Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Users</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.totalUsers}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Tickets</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.totalTickets}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Groups</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.totalGroups}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Modules</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.totalModules}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Enabled Modules</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.enabledModules}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Active Sessions</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{systemInfo.activeSessions}</p>
          </div>
        </div>
      </div>

      {/* Database Statistics */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Database Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Users</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.users}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Sessions</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.sessions}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.tickets}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Comments</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.ticketComments}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Groups</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.groups}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Memberships</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.groupMemberships}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Modules</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{databaseStats.modules}</p>
          </div>
        </div>
      </div>

      {/* Links module: default page size (admin only) */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Links module
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Default number of links per page on the links overview. Users can still change the page size on the page (10, 25, 50, 100, or All).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span>Default page size</span>
            <select
              value={linksDefaultPageSize}
              onChange={(e) =>
                setLinksDefaultPageSize(
                  e.target.value === "all"
                    ? LINK_PAGE_SIZE_ALL
                    : parseInt(e.target.value, 10)
                )
              }
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {LINKS_DEFAULT_PAGE_SIZE_VALUES.map((n) => (
                <option key={n} value={n}>
                  {n === LINK_PAGE_SIZE_ALL ? "All" : n}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            onClick={handleLinksDefaultPageSizeSave}
            loading={linksPageSizeSaving}
          >
            Save
          </Button>
        </div>
        {linksPageSizeMessage && (
          <p
            className={`mt-3 text-sm ${
              linksPageSizeMessage.type === "success"
                ? "text-success-600 dark:text-success-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {linksPageSizeMessage.text}
          </p>
        )}
      </div>

      {/* Purge Accounts */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Purge Deleted Accounts</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Permanently delete accounts that have been marked for deletion for more than 30 days. This action cannot be undone.
        </p>
        {purgeResult && (
          <div className={`p-3 rounded-lg mb-4 ${
            purgeResult.deletedCount > 0
              ? "bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800"
              : "bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
          }`}>
            <p className={`text-sm ${
              purgeResult.deletedCount > 0
                ? "text-success-700 dark:text-success-300"
                : "text-neutral-700 dark:text-neutral-300"
            }`}>
              {purgeResult.message}
            </p>
          </div>
        )}
        <Button variant="danger" onClick={handlePurge} loading={isPurging}>
          Purge Deleted Accounts
        </Button>
      </div>
    </div>
  );
}
