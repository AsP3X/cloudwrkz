"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getGroup } from "@/server/actions/groups";
import { GroupPermissionsManager } from "./GroupPermissionsManager";

type Group = NonNullable<Awaited<ReturnType<typeof getGroup>>>;

interface GroupPermissionsPageProps {
  group: Group;
}

export function GroupPermissionsPage({ group: initialGroup }: GroupPermissionsPageProps) {
  const router = useRouter();
  const [group, setGroup] = React.useState(initialGroup);

  // Sync group state when initialGroup changes (e.g., after router.refresh())
  React.useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup.id, initialGroup.permissions?.length, initialGroup._count?.permissions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/admin/permissions/groups"
              className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              Group Permissions
            </Link>
            <span className="text-neutral-400 dark:text-neutral-600">/</span>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {group.name}
            </h1>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for this group. Permissions are additive - users get permissions from their role plus all groups they belong to.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/admin/groups/${group.id}`}>
            <Button variant="outline">View Group Details</Button>
          </Link>
        </div>
      </div>

      {/* Group Info Card */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {group.name}
            </h2>
            {group.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                {group.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {group.members.length}
                </strong>{" "}
                member{group.members.length !== 1 ? "s" : ""}
              </span>
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {group.permissions?.length || group._count?.permissions || 0}
                </strong>{" "}
                permission{((group.permissions?.length || group._count?.permissions || 0) !== 1) ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions Manager */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <GroupPermissionsManager
          groupId={group.id}
          initialPermissionIds={group.permissions?.map((p) => p.permission.id) || []}
          onSave={async () => {
            // Reload the group data to update the info card immediately
            const updatedGroup = await getGroup(group.id);
            if (updatedGroup) {
              setGroup(updatedGroup);
            }
            // Also trigger router refresh for server component updates
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
