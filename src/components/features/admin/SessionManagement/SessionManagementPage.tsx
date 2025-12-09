"use client";

import React, { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { deleteSessionAdmin, deleteUserSessionsAdmin, deleteExpiredSessionsAdmin, type SessionFilters } from "@/server/actions/admin/sessions";
import type { getAllSessionsAdmin } from "@/server/actions/admin/sessions";
import { formatDateTimeFull } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

type Session = Awaited<ReturnType<typeof getAllSessionsAdmin>>["sessions"][0];

type GroupedSessions = {
  userId: string;
  user: Session["user"];
  sessions: Session[];
};

interface SessionManagementPageProps {
  initialData: Awaited<ReturnType<typeof getAllSessionsAdmin>>;
}

export function SessionManagementPage({ initialData }: SessionManagementPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllUserDialogOpen, setDeleteAllUserDialogOpen] = useState(false);
  const [deleteExpiredDialogOpen, setDeleteExpiredDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [filters, setFilters] = useState<SessionFilters>({
    search: searchParams.get("search") || undefined,
    page: initialData.page,
  });

  const [localSearch, setLocalSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    // Initialize with all user IDs expanded
    const userIds = new Set<string>();
    initialData.sessions.forEach((session) => {
      userIds.add(session.userId);
    });
    return userIds;
  });

  const updateFilters = (newFilters: Partial<SessionFilters>) => {
    const updated = { ...filters, ...newFilters, page: 1 };
    setFilters(updated);
    const params = new URLSearchParams();
    if (updated.search) params.set("search", updated.search);
    router.push(`/dashboard/admin/sessions?${params.toString()}`);
  };

  const toggleGroup = (userId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    setExpandedGroups(new Set(groupedSessions.map((g) => g.userId)));
  };

  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
  };

  const handleDeleteSession = async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await deleteSessionAdmin(sessionId);
    setIsLoading(false);
    if (result.success) {
      setSuccess(result.message || "Session revoked successfully");
      setDeleteDialogOpen(false);
      setSelectedSession(null);
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 1000);
    } else {
      setError(result.error || "Failed to revoke session");
    }
  };

  const handleDeleteAllUserSessions = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await deleteUserSessionsAdmin(userId);
    setIsLoading(false);
    if (result.success) {
      setSuccess(result.message || "All user sessions revoked successfully");
      setDeleteAllUserDialogOpen(false);
      setSelectedUserId(null);
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 1000);
    } else {
      setError(result.error || "Failed to revoke user sessions");
    }
  };

  const handleDeleteExpiredSessions = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await deleteExpiredSessionsAdmin();
    setIsLoading(false);
    if (result.success) {
      setSuccess(result.message || `${result.data?.count || 0} expired session(s) cleaned successfully`);
      setDeleteExpiredDialogOpen(false);
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 1000);
    } else {
      setError(result.error || "Failed to clean expired sessions");
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "PENDING":
        return "warning";
      case "SUSPENDED":
        return "error";
      case "DELETED":
        return "default";
      default:
        return "default";
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "error";
      case "MODERATOR":
        return "warning";
      case "AGENT":
        return "info";
      default:
        return "default";
    }
  };

  const formatTimeRemaining = (expiresAt: Date) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? "s" : ""}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""}`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minute${diffMins > 1 ? "s" : ""}`;
    }
  };

  // Group sessions by user
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, GroupedSessions>();
    
    initialData.sessions.forEach((session) => {
      if (!groups.has(session.userId)) {
        groups.set(session.userId, {
          userId: session.userId,
          user: session.user,
          sessions: [],
        });
      }
      groups.get(session.userId)!.sessions.push(session);
    });

    return Array.from(groups.values());
  }, [initialData.sessions]);

  // Filter groups based on local search
  const filteredGroups = useMemo(() => {
    if (!localSearch.trim()) {
      return groupedSessions;
    }

    const searchLower = localSearch.toLowerCase();
    return groupedSessions.filter((group) => {
      const name = group.user.name?.toLowerCase() || "";
      const email = group.user.email.toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower);
    });
  }, [groupedSessions, localSearch]);

  // Check if all filtered groups are expanded
  const allFilteredExpanded = filteredGroups.length > 0 && 
    filteredGroups.every((g) => expandedGroups.has(g.userId));
  
  // Check if all filtered groups are collapsed
  const allFilteredCollapsed = filteredGroups.length > 0 && 
    filteredGroups.every((g) => !expandedGroups.has(g.userId));

  // Collapsible section component for user groups
  const UserSessionGroup = ({ group }: { group: GroupedSessions }) => {
    const isExpanded = expandedGroups.has(group.userId);
    const handleToggle = () => {
      toggleGroup(group.userId);
    };

    const UserIcon = () => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    );

    return (
      <div className="space-y-1 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {/* Header with toggle */}
        <div className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <button
              type="button"
              onClick={handleToggle}
              className="flex items-center gap-3 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 rounded text-left"
            >
            <span className="text-neutral-500 dark:text-neutral-400 flex-shrink-0">
              <UserIcon />
            </span>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {group.user.name || group.user.email}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {group.user.email}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={getRoleBadgeVariant(group.user.role)} size="sm">
                  {group.user.role}
                </Badge>
                <Badge variant={getStatusBadgeVariant(group.user.status)} size="sm">
                  {group.user.status}
                </Badge>
                <Badge variant="default" size="sm">
                  {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUserId(group.userId);
                setDeleteAllUserDialogOpen(true);
              }}
            >
              Revoke All
            </Button>
            <button
              type="button"
              onClick={handleToggle}
              className="focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 rounded p-1"
            >
              <svg
                className={cn(
                  "w-4 h-4 text-neutral-500 dark:text-neutral-400 transition-transform duration-200",
                  isExpanded ? "transform rotate-180" : ""
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="bg-white dark:bg-neutral-900">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-neutral-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300">Session Created</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300">Expires In</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300">Last Updated</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {group.sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDateTimeFull(session.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                          {formatTimeRemaining(session.expiresAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                          {formatDateTimeFull(session.updatedAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedSession(session);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error-400 hover:text-error-600 dark:hover:text-error-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-success-400 hover:text-success-600 dark:hover:text-success-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Active Sessions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage all active user sessions ({initialData.total} total)
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setDeleteExpiredDialogOpen(true)}
        >
          Clean Expired Sessions
        </Button>
      </div>

      {/* Sessions Grouped by User */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {/* Menu Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                label="Search"
                placeholder="Search by user name or email..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllGroups}
                disabled={allFilteredExpanded || filteredGroups.length === 0}
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAllGroups}
                disabled={allFilteredCollapsed || filteredGroups.length === 0}
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Collapse All
              </Button>
            </div>
          </div>
        </div>

        {/* Session Groups Content */}
        <div className="p-6">
          {filteredGroups.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              {localSearch.trim() ? "No groups match your search" : "No active sessions found"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((group) => (
                <UserSessionGroup key={group.userId} group={group} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {initialData.totalPages > 1 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Page {initialData.page} of {initialData.totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page === 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(initialData.page - 1));
                router.push(`/dashboard/admin/sessions?${params.toString()}`);
              }}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page === initialData.totalPages}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(initialData.page + 1));
                router.push(`/dashboard/admin/sessions?${params.toString()}`);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Session Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Revoke Session"
        description={`Are you sure you want to revoke this session for ${selectedSession?.user.email}?`}
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => selectedSession && handleDeleteSession(selectedSession.id)}
            disabled={isLoading}
          >
            {isLoading ? "Revoking..." : "Revoke Session"}
          </Button>
        </div>
      </Dialog>

      {/* Delete All User Sessions Dialog */}
      <Dialog
        open={deleteAllUserDialogOpen}
        onOpenChange={setDeleteAllUserDialogOpen}
        title="Revoke All User Sessions"
        description="Are you sure you want to revoke all sessions for this user? They will be logged out from all devices."
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteAllUserDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => selectedUserId && handleDeleteAllUserSessions(selectedUserId)}
            disabled={isLoading}
          >
            {isLoading ? "Revoking..." : "Revoke All Sessions"}
          </Button>
        </div>
      </Dialog>

      {/* Delete Expired Sessions Dialog */}
      <Dialog
        open={deleteExpiredDialogOpen}
        onOpenChange={setDeleteExpiredDialogOpen}
        title="Clean Expired Sessions"
        description="This will delete all expired sessions from the database. This action cannot be undone."
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteExpiredDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteExpiredSessions}
            disabled={isLoading}
          >
            {isLoading ? "Cleaning..." : "Clean Expired Sessions"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
