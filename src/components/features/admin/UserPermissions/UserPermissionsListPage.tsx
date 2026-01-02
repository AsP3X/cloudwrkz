"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string | Date; // Can be string (from server) or Date (client-side)
  _count?: {
    permissions?: number;
    groupMemberships?: number;
  };
};

interface UserPermissionsListPageProps {
  users: User[];
  searchParams?: {
    sort?: string;
    role?: string;
    status?: string;
    minPermissions?: string;
    maxPermissions?: string;
    createdFrom?: string;
    createdTo?: string;
  };
}

export function UserPermissionsListPage({ users: initialUsers, searchParams = {} }: UserPermissionsListPageProps) {
  const [localSearch, setLocalSearch] = useState("");

  // Filter and sort users based on search params and local search
  const filteredUsers = useMemo(() => {
    let filtered = [...initialUsers];

    // Apply local search filter
    if (localSearch.trim()) {
      const searchLower = localSearch.toLowerCase();
      filtered = filtered.filter((user) => {
        const name = (user.name || "").toLowerCase();
        const email = user.email.toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower);
      });
    }

    // Apply URL filter params
    if (searchParams.role) {
      filtered = filtered.filter((user) => user.role === searchParams.role);
    }

    if (searchParams.status) {
      filtered = filtered.filter((user) => user.status === searchParams.status);
    }

    if (searchParams.minPermissions) {
      const min = parseInt(searchParams.minPermissions, 10);
      if (!isNaN(min)) {
        filtered = filtered.filter((user) => (user._count?.permissions || 0) >= min);
      }
    }

    if (searchParams.maxPermissions) {
      const max = parseInt(searchParams.maxPermissions, 10);
      if (!isNaN(max)) {
        filtered = filtered.filter((user) => (user._count?.permissions || 0) <= max);
      }
    }

    if (searchParams.createdFrom) {
      const fromDate = new Date(searchParams.createdFrom);
      filtered = filtered.filter((user) => {
        const userDate = typeof user.createdAt === 'string' ? new Date(user.createdAt) : user.createdAt;
        return userDate >= fromDate;
      });
    }

    if (searchParams.createdTo) {
      const toDate = new Date(searchParams.createdTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      filtered = filtered.filter((user) => {
        const userDate = typeof user.createdAt === 'string' ? new Date(user.createdAt) : user.createdAt;
        return userDate <= toDate;
      });
    }

    // Apply sorting
    const sortParam = searchParams.sort || "name-asc";
    const [sortBy, sortOrder] = sortParam.split("-") as [string, "asc" | "desc"];

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case "email":
          comparison = a.email.localeCompare(b.email);
          break;
        case "role":
          comparison = a.role.localeCompare(b.role);
          break;
        case "permissions":
          comparison = (a._count?.permissions || 0) - (b._count?.permissions || 0);
          break;
        case "createdAt":
          const aDate = typeof a.createdAt === 'string' ? new Date(a.createdAt) : a.createdAt;
          const bDate = typeof b.createdAt === 'string' ? new Date(b.createdAt) : b.createdAt;
          comparison = aDate.getTime() - bDate.getTime();
          break;
        default:
          comparison = (a.name || a.email).localeCompare(b.name || b.email);
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [initialUsers, localSearch, searchParams]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">User Permissions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for individual users ({initialUsers.length} total{localSearch.trim() && filteredUsers.length !== initialUsers.length ? `, ${filteredUsers.length} shown` : ""})
          </p>
        </div>
      </div>

      {/* Results Count */}
      {filteredUsers.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Users List */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50">
        {/* Menu Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                label="Search"
                placeholder="Search by name or email..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Link href="/dashboard/admin/users">
                <Button variant="outline">Manage Users</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Users Table */}
        {filteredUsers.length === 0 ? (
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
                  No users found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No users match your search criteria.
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No users yet
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No users found in the system.
                </p>
                <Link href="/dashboard/admin/users">
                  <Button variant="primary">Go to User Management</Button>
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
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Groups
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Direct Permissions
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
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
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {user.name || user.email}
                          </div>
                          {user.name && (
                            <div className="text-sm text-neutral-600 dark:text-neutral-400">
                              {user.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={user.role === "ADMIN" ? "error" : user.role === "MODERATOR" ? "warning" : user.role === "AGENT" ? "info" : "default"} size="sm">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={user.status === "ACTIVE" ? "success" : user.status === "BANNED" ? "error" : "default"} size="sm">
                        {user.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="default" size="sm">
                        {user._count?.groupMemberships || 0} group{(user._count?.groupMemberships || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">
                        {user._count?.permissions || 0} permission{(user._count?.permissions || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/admin/permissions/users/${user.id}`}>
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
