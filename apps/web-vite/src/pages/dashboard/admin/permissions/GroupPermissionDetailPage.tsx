import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { GroupPermissionsManager } from "@/components/features/admin/GroupPermissionsManager";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

// Human: Group-level permission matrix with membership preview and GroupPermissionsManager for bulk toggles.
// Agent: FETCH /admin/groups/:id; STATE group,permissionCount; READS admin.permissions.*; navigate on missing id.

interface GroupData {
  group: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    members: Array<{ id: string; name: string | null; email: string; role: string }>;
  };
}

// Human: Loads group metadata, counts effective permissions, and mounts the manager once RBAC checks pass.
// Agent: useParams id; useEffect guarded fetch; STATE loading,group; EARLY AccessDeniedWarning when unauthorized.

export default function GroupPermissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canView = can("admin.permissions.view") || can("admin.permissions.manage");
  const [group, setGroup] = useState<GroupData["group"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionCount, setPermissionCount] = useState(0);

  useEffect(() => {
    if (!canView || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<GroupData>(`/admin/groups/${id}`);
        if (!cancelled && data.group) {
          setGroup(data.group);
          const permRes = await api.get<{ permissions: unknown[] }>(`/admin/groups/${id}/permissions`);
          if (!cancelled) setPermissionCount(permRes.permissions?.length ?? 0);
        }
      } catch {
        if (!cancelled) setGroup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView, id]);

  const refreshCount = async () => {
    if (!id) return;
    try {
      const res = await api.get<{ permissions: unknown[] }>(`/admin/groups/${id}/permissions`);
      setPermissionCount(res.permissions?.length ?? 0);
    } catch {}
  };

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to manage group permissions."
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }

  if (loading || !id) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-600 dark:text-neutral-400">Group not found.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard/admin/permissions/groups")}>
          Back to Group Permissions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/dashboard/admin/permissions/groups"
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
            Manage permissions for this group. Users in the group receive these permissions in addition to their role and direct permissions.
          </p>
        </div>
        <Link to={`/dashboard/admin/groups/${group.id}`}>
          <Button variant="outline">View Group Details</Button>
        </Link>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {group.name}
            </h2>
            {group.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{group.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">{group.members.length}</strong> member{group.members.length !== 1 ? "s" : ""}
              </span>
              <span>
                <strong className="text-neutral-900 dark:text-neutral-100">{permissionCount}</strong> permission{permissionCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <GroupPermissionsManager groupId={group.id} onSave={refreshCount} />
      </div>
    </div>
  );
}
