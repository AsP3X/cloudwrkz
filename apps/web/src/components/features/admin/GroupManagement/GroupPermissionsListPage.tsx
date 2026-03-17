"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getGroups } from "@/server/actions/groups";
import { GroupPermissionsFilterButton } from "./GroupPermissionsFilterButton";

type Group = Awaited<ReturnType<typeof getGroups>>[number];

interface GroupPermissionsListPageProps {
  groups: Group[];
  searchParams?: {
    sort?: string;
    minMembers?: string;
    maxMembers?: string;
    minPermissions?: string;
    maxPermissions?: string;
    createdFrom?: string;
    createdTo?: string;
  };
}

const EMPTY_SEARCH_PARAMS: NonNullable<GroupPermissionsListPageProps['searchParams']> = {};

export function GroupPermissionsListPage({ groups: initialGroups, searchParams = EMPTY_SEARCH_PARAMS }: GroupPermissionsListPageProps) {
  const [localSearch, setLocalSearch] = useState("");

  // Filter and sort groups based on search params and local search
  const filteredGroups = useMemo(() => {
    let filtered = [...initialGroups];

    // Apply local search filter
    if (localSearch.trim()) {
      const searchLower = localSearch.toLowerCase();
      filtered = filtered.filter((group) => {
        const name = group.name.toLowerCase();
        const description = (group.description || "").toLowerCase();
        return name.includes(searchLower) || description.includes(searchLower);
      });
    }

    // Apply URL filter params
    if (searchParams.minMembers) {
      const min = parseInt(searchParams.minMembers, 10);
      if (!isNaN(min)) {
        filtered = filtered.filter((group) => (group._count?.members || 0) >= min);
      }
    }

    if (searchParams.maxMembers) {
      const max = parseInt(searchParams.maxMembers, 10);
      if (!isNaN(max)) {
        filtered = filtered.filter((group) => (group._count?.members || 0) <= max);
      }
    }

    if (searchParams.minPermissions) {
      const min = parseInt(searchParams.minPermissions, 10);
      if (!isNaN(min)) {
        filtered = filtered.filter((group) => (group._count?.permissions || 0) >= min);
      }
    }

    if (searchParams.maxPermissions) {
      const max = parseInt(searchParams.maxPermissions, 10);
      if (!isNaN(max)) {
        filtered = filtered.filter((group) => (group._count?.permissions || 0) <= max);
      }
    }

    if (searchParams.createdFrom) {
      const fromDate = new Date(searchParams.createdFrom);
      filtered = filtered.filter((group) => new Date(group.createdAt) >= fromDate);
    }

    if (searchParams.createdTo) {
      const toDate = new Date(searchParams.createdTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      filtered = filtered.filter((group) => new Date(group.createdAt) <= toDate);
    }

    // Apply sorting
    const sortParam = searchParams.sort || "name-asc";
    const [sortBy, sortOrder] = sortParam.split("-") as [string, "asc" | "desc"];

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "members":
          comparison = (a._count?.members || 0) - (b._count?.members || 0);
          break;
        case "permissions":
          comparison = (a._count?.permissions || 0) - (b._count?.permissions || 0);
          break;
        case "createdAt":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [initialGroups, localSearch, searchParams]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Group Permissions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for groups ({initialGroups.length} total{localSearch.trim() && filteredGroups.length !== initialGroups.length ? `, ${filteredGroups.length} shown` : ""})
          </p>
        </div>
      </div>

      {/* Results Count */}
      {filteredGroups.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Groups List */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50">
        {/* Menu Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                label="Search"
                placeholder="Search by group name or description..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <GroupPermissionsFilterButton />
              <Link href="/dashboard/admin/groups">
                <Button variant="outline">Manage Groups</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Groups Content */}
        {filteredGroups.length === 0 ? (
          <div className="p-12 text-center">
            {localSearch.trim() ? (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No groups found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No groups match your search criteria.
                </p>
                <Button variant="outline" onClick={() => setLocalSearch("")}>
                  Clear Search
                </Button>
              </>
            ) : (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No groups yet
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  Create a group first to assign permissions.
                </p>
                <Link href="/dashboard/admin/groups">
                  <Button variant="primary">Go to Group Management</Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Permissions
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredGroups.map((group) => (
                  <tr
                    key={group.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-neutral-400 dark:text-neutral-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                        </div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {group.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
                        {group.description || (
                          <span className="text-neutral-400 dark:text-neutral-500 italic">
                            No description
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="default" size="sm">
                        {group._count?.members || 0} member{(group._count?.members || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">
                        {group._count?.permissions || 0} permission{(group._count?.permissions || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/admin/permissions/groups/${group.id}`}>
                          <Button variant="primary" size="sm">
                            Manage Permissions
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
