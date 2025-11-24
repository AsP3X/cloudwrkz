"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { UserCreateDialog } from "./UserCreateDialog";
import { UserEditDialog } from "./UserEditDialog";
import { UserDeleteDialog } from "./UserDeleteDialog";
import { createUserAdmin, updateUserAdmin, deleteUserAdmin, bulkUpdateUserStatusAdmin, type UserFilters } from "@/server/actions/admin/users";
import type { getAllUsersAdmin } from "@/server/actions/admin/users";
import { formatDate } from "@/lib/utils/date";

type User = Awaited<ReturnType<typeof getAllUsersAdmin>>["users"][0];

interface UserManagementPageProps {
  initialData: Awaited<ReturnType<typeof getAllUsersAdmin>>;
}

export function UserManagementPage({ initialData }: UserManagementPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [filters, setFilters] = useState<UserFilters>({
    status: (searchParams.get("status") as any) || undefined,
    role: (searchParams.get("role") as any) || undefined,
    search: searchParams.get("search") || undefined,
    page: initialData.page,
  });

  const updateFilters = (newFilters: Partial<UserFilters>) => {
    const updated = { ...filters, ...newFilters, page: 1 };
    setFilters(updated);
    const params = new URLSearchParams();
    if (updated.status) params.set("status", updated.status);
    if (updated.role) params.set("role", updated.role);
    if (updated.search) params.set("search", updated.search);
    router.push(`/dashboard/admin/users?${params.toString()}`);
  };

  const handleCreate = async (data: any) => {
    setIsLoading(true);
    const result = await createUserAdmin(data);
    setIsLoading(false);
    if (result.success) {
      setCreateDialogOpen(false);
      router.refresh();
    }
    return result;
  };

  const handleEdit = async (userId: string, data: any) => {
    setIsLoading(true);
    const result = await updateUserAdmin(userId, data);
    setIsLoading(false);
    if (result.success) {
      setEditDialogOpen(false);
      setSelectedUser(null);
      router.refresh();
    }
    return result;
  };

  const handleDelete = async (userId: string) => {
    setIsLoading(true);
    const result = await deleteUserAdmin(userId);
    setIsLoading(false);
    if (result.success) {
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      router.refresh();
    }
    return result;
  };

  const handleBulkStatusUpdate = async (status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED") => {
    if (selectedUsers.size === 0) return;
    setIsLoading(true);
    const result = await bulkUpdateUserStatusAdmin(Array.from(selectedUsers), status);
    setIsLoading(false);
    if (result.success) {
      setSelectedUsers(new Set());
      router.refresh();
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedUsers.size === initialData.users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(initialData.users.map((u) => u.id)));
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">User Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage all system users ({initialData.total} total)
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
          Create User
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Search"
            placeholder="Search by email or name..."
            value={filters.search || ""}
            onChange={(e) => updateFilters({ search: e.target.value })}
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "PENDING", label: "Pending" },
              { value: "SUSPENDED", label: "Suspended" },
              { value: "DELETED", label: "Deleted" },
            ]}
            value={filters.status || ""}
            onChange={(e) => updateFilters({ status: e.target.value || undefined })}
          />
          <Select
            label="Role"
            placeholder="All roles"
            options={[
              { value: "", label: "All roles" },
              { value: "USER", label: "User" },
              { value: "AGENT", label: "Agent" },
              { value: "MODERATOR", label: "Moderator" },
              { value: "ADMIN", label: "Admin" },
            ]}
            value={filters.role || ""}
            onChange={(e) => updateFilters({ role: e.target.value || undefined })}
          />
          {selectedUsers.size > 0 && (
            <div className="flex items-end gap-2">
              <Select
                label="Bulk Actions"
                options={[
                  { value: "", label: "Select action..." },
                  { value: "ACTIVE", label: "Activate" },
                  { value: "SUSPENDED", label: "Suspend" },
                  { value: "DELETED", label: "Delete" },
                ]}
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStatusUpdate(e.target.value as any);
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === initialData.users.length && initialData.users.length > 0}
                    onChange={toggleAllSelection}
                    className="rounded border-neutral-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Role</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Tickets</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Created</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {initialData.users.map((user) => (
                <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">{user.name || "-"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={getRoleBadgeVariant(user.role)} size="sm">
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getStatusBadgeVariant(user.status)} size="sm">
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                    {user._count.createdTickets + user._count.assignedTickets}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/dashboard/admin/users/${user.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setEditDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {initialData.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
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
                  router.push(`/dashboard/admin/users?${params.toString()}`);
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
                  router.push(`/dashboard/admin/users?${params.toString()}`);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <UserCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreate}
        isLoading={isLoading}
      />
      {selectedUser && (
        <>
          <UserEditDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            user={selectedUser}
            onSubmit={(data) => handleEdit(selectedUser.id, data)}
            isLoading={isLoading}
          />
          <UserDeleteDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            user={selectedUser}
            onConfirm={() => handleDelete(selectedUser.id)}
            isLoading={isLoading}
          />
        </>
      )}
    </div>
  );
}
