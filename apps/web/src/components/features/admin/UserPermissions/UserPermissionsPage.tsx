"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { getUserByIdAdmin } from "@/server/actions/admin/users";
import { UserPermissionsManager } from "./UserPermissionsManager";

type User = NonNullable<Awaited<ReturnType<typeof getUserByIdAdmin>>>;

interface UserPermissionsPageProps {
  user: User;
}

export function UserPermissionsPage({ user: initialUser }: UserPermissionsPageProps) {
  const router = useRouter();
  const [user, setUser] = React.useState(initialUser);

  // Sync user state when initialUser changes (e.g., after router.refresh())
  React.useEffect(() => {
    setUser(initialUser);
    // Debug: Log group membership data
    if (process.env.NODE_ENV === "development") {
      console.log("[UserPermissionsPage] User data:", {
        email: initialUser.email,
        groupMembershipsLength: initialUser.groupMemberships?.length,
        groupMembershipsCount: initialUser._count?.groupMemberships,
        groupMemberships: initialUser.groupMemberships?.map(gm => gm.group.name),
      });
    }
  }, [initialUser]);

  // Get user permissions count and IDs
  const [permissionsCount, setPermissionsCount] = React.useState(0);
  const [permissionIds, setPermissionIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    async function loadPermissions() {
      try {
        const { getUserPermissions } = await import("@/server/actions/permissions");
        const perms = await getUserPermissions(user.id);
        setPermissionsCount(perms.length);
        setPermissionIds(perms.map((p) => p.id));
      } catch (err) {
        console.error("Failed to load permissions:", err);
      }
    }
    loadPermissions();
  }, [user.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/admin/permissions/users"
              className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              User Permissions
            </Link>
            <span className="text-neutral-400 dark:text-neutral-600">/</span>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {user.name || user.email}
            </h1>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for this user. Permissions are additive - users get permissions from their role, groups they belong to, and direct user permissions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/admin/users/${user.id}`}>
            <Button variant="outline">View User Details</Button>
          </Link>
        </div>
      </div>

      {/* User Info Card */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {user.name || user.email}
            </h2>
            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">Email:</strong> {user.email}
              </span>
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">Role:</strong> {user.role}
              </span>
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">Status:</strong> {user.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {user.groupMemberships?.length ?? user._count?.groupMemberships ?? 0}
                </strong>{" "}
                group{(user.groupMemberships?.length ?? user._count?.groupMemberships ?? 0) !== 1 ? "s" : ""}
              </span>
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {permissionsCount}
                </strong>{" "}
                direct permission{permissionsCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions Manager */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <UserPermissionsManager
          userId={user.id}
          initialPermissionIds={permissionIds}
          onSave={async () => {
            // Reload the user data to update the info card immediately
            const updatedUser = await getUserByIdAdmin(user.id);
            if (updatedUser) {
              setUser(updatedUser);
            }
            // Reload permissions count and IDs
            try {
              const { getUserPermissions } = await import("@/server/actions/permissions");
              const perms = await getUserPermissions(user.id);
              setPermissionsCount(perms.length);
              setPermissionIds(perms.map((p) => p.id));
            } catch (err) {
              console.error("Failed to reload permissions:", err);
            }
            // Also trigger router refresh for server component updates
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
