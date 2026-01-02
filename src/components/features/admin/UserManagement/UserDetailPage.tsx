"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { updateUserAdmin, deleteUserAdmin, unbanUserAdmin, getUserEffectivePermissions } from "@/server/actions/admin/users";
import type { getUserByIdAdmin } from "@/server/actions/admin/users";
import { formatDateTimeFull } from "@/lib/utils/date";
import { UserUnbanDialog } from "./UserUnbanDialog";

type User = NonNullable<Awaited<ReturnType<typeof getUserByIdAdmin>>>;

interface UserDetailPageProps {
  user: User;
}

export function UserDetailPage({ user: initialUser }: UserDetailPageProps) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: user.email,
    name: user.name || "",
    password: "",
    role: user.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR",
    status: user.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [permissionSearch, setPermissionSearch] = useState("");

  React.useEffect(() => {
    if (editDialogOpen) {
      setFormData({
        email: user.email,
        name: user.name || "",
        password: "",
        role: user.role as any,
        status: user.status as any,
      });
      setError(null);
      setFieldErrors({});
    }
  }, [editDialogOpen, user]);

  React.useEffect(() => {
    async function loadPermissions() {
      try {
        setLoadingPermissions(true);
        const perms = await getUserEffectivePermissions(user.id);
        setEffectivePermissions(perms);
      } catch (err) {
        console.error("Failed to load permissions:", err);
      } finally {
        setLoadingPermissions(false);
      }
    }
    loadPermissions();
  }, [user.id]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    const updateData: any = {
      email: formData.email,
      name: formData.name || null,
      role: formData.role,
      status: formData.status,
    };

    if (formData.password) {
      updateData.password = formData.password;
    }

    const result = await updateUserAdmin(user.id, updateData);
    setIsLoading(false);

    if (result.success) {
      setEditDialogOpen(false);
      router.refresh();
    } else {
      setError(result.error);
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    const result = await deleteUserAdmin(user.id);
    setIsLoading(false);
    if (result.success) {
      router.push("/dashboard/admin/users");
    } else {
      setError(result.error);
    }
  };

  const handleUnban = async (reason: string) => {
    setIsLoading(true);
    setError(null);
    const result = await unbanUserAdmin(user.id, { reason });
    setIsLoading(false);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error);
    }
    return result;
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

  // Filter permissions based on search query
  const filteredPermissions = useMemo(() => {
    if (!permissionSearch.trim()) {
      return effectivePermissions;
    }
    const searchLower = permissionSearch.toLowerCase();
    return effectivePermissions.filter((perm) =>
      perm.toLowerCase().includes(searchLower)
    );
  }, [effectivePermissions, permissionSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/dashboard/admin/users" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
            ← Back to Users
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {user.name || user.email.split("@")[0]}
            </h1>
            <Badge variant={getRoleBadgeVariant(user.role)} size="md">
              {user.role}
            </Badge>
            <Badge variant={getStatusBadgeVariant(user.status)} size="md">
              {user.status}
            </Badge>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">{user.email}</p>
        </div>
        <div className="flex gap-2">
          {user.status === "BANNED" && (
            <Button variant="primary" onClick={() => setUnbanDialogOpen(true)}>
              Unban User
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            Edit User
          </Button>
          <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
            Delete User
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.createdTickets}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Assigned Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.assignedTickets}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Comments</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.ticketComments}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Group Memberships</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{user._count.groupMemberships}</p>
        </div>
      </div>

      {/* User Details */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">User Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Email</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{user.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Name</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">{user.name || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Email Verified</p>
            <Badge variant={user.emailVerified ? "success" : "warning"} size="sm" className="mt-1">
              {user.emailVerified ? "Verified" : "Not Verified"}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created At</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {formatDateTimeFull(user.createdAt)}
            </p>
          </div>
          {user.lastLoginAt && (
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Last Login</p>
              <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
                {formatDateTimeFull(user.lastLoginAt)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Group Memberships */}
      {user.groupMemberships && user.groupMemberships.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Group Memberships</h2>
          <div className="space-y-3">
            {user.groupMemberships.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <Link
                    href={`/dashboard/admin/groups/${membership.group.id}`}
                    className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {membership.group.name}
                  </Link>
                  {membership.group.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                      {membership.group.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Effective Permissions */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Effective Permissions</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                This user has {effectivePermissions.length} permission{effectivePermissions.length !== 1 ? "s" : ""} (from role + groups)
                {permissionSearch.trim() && filteredPermissions.length !== effectivePermissions.length && (
                  <span className="ml-1">
                    ({filteredPermissions.length} shown)
                  </span>
                )}
              </p>
            </div>
            {!loadingPermissions && effectivePermissions.length > 0 && (
              <div className="w-full sm:w-auto sm:min-w-[400px]">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg
                      className="h-5 w-5 text-neutral-400 dark:text-neutral-500"
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
                  </div>
                  <Input
                    placeholder="Search permissions..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    className="pl-11 pr-4 py-3 text-base border-2 focus:border-primary-500 dark:focus:border-primary-400 shadow-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        {loadingPermissions ? (
          <div className="p-12 text-center">
            <p className="text-neutral-600 dark:text-neutral-400">Loading permissions...</p>
          </div>
        ) : effectivePermissions.length > 0 ? (
          <>
            {/* Permissions Table */}
            {filteredPermissions.length === 0 ? (
              <div className="p-12 text-center">
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
                  No permissions found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No permissions match your search criteria.
                </p>
                <Button variant="outline" onClick={() => setPermissionSearch("")}>
                  Clear Search
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                        Permission
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredPermissions.map((perm) => (
                      <tr
                        key={perm}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <td className="px-6 py-4">
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
                                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                              </svg>
                            </div>
                            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {perm}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center">
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              No permissions assigned
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              This user has no permissions assigned.
            </p>
          </div>
        )}
      </div>

      {/* Ban Information */}
      {user.status === "BANNED" && (user as any).bannedAt && (
        <div className="bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 rounded-xl shadow-soft-lg p-6">
          <h2 className="text-xl font-semibold text-error-900 dark:text-error-100 mb-4">Ban Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(user as any).bannedAt && (
              <div>
                <p className="text-sm font-medium text-error-700 dark:text-error-300">Banned On</p>
                <p className="text-base text-error-900 dark:text-error-100 mt-1">
                  {formatDateTimeFull((user as any).bannedAt)}
                </p>
              </div>
            )}
            {(user as any).banReason && (
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-error-700 dark:text-error-300">Ban Reason</p>
                <p className="text-base text-error-900 dark:text-error-100 mt-1 whitespace-pre-wrap">
                  {(user as any).banReason}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Edit User"
        description={`Edit user: ${user.email}`}
      >
        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={fieldErrors.email?.[0]}
          />

          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={fieldErrors.name?.[0]}
          />

          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            error={fieldErrors.password?.[0]}
            helperText="Leave blank to keep current password"
          />

          <Select
            label="Role"
            required
            options={[
              { value: "USER", label: "User" },
              { value: "AGENT", label: "Agent" },
              { value: "MODERATOR", label: "Moderator" },
              { value: "ADMIN", label: "Admin" },
            ]}
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
            error={fieldErrors.role?.[0]}
          />

          <Select
            label="Status"
            required
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "PENDING", label: "Pending" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "DELETED", label: "Deleted" },
            ]}
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            error={fieldErrors.status?.[0]}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete User"
        description={`Are you sure you want to delete ${user.email}? This action cannot be undone.`}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg mb-4">
            <p className="text-sm text-error-700 dark:text-error-300">
              This will permanently delete the user account and all associated data. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isLoading}>
              Delete User
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Unban Dialog */}
      <UserUnbanDialog
        open={unbanDialogOpen}
        onOpenChange={setUnbanDialogOpen}
        user={user}
        onConfirm={handleUnban}
        isLoading={isLoading}
      />
    </div>
  );
}
