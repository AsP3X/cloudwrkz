"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { updateUserAdmin, deleteUserAdmin } from "@/server/actions/admin/users";
import type { getUserByIdAdmin } from "@/server/actions/admin/users";
import { formatDateTimeFull } from "@/lib/utils/date";

type User = NonNullable<Awaited<ReturnType<typeof getUserByIdAdmin>>>;

interface UserDetailPageProps {
  user: User;
}

export function UserDetailPage({ user: initialUser }: UserDetailPageProps) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
    </div>
  );
}
