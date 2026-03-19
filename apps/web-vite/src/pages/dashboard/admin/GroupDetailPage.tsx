import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt?: string;
  memberCount?: number;
  members?: Array<{ id: string; user: { name: string | null; email: string }; role: string }>;
};

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const canManagePermissions = can("admin.permissions.manage");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ group: GroupDetail }>(`/admin/groups/${id}`)
      .then((data) => {
        if (!cancelled) setGroup(data.group);
      })
      .catch(() => {
        if (!cancelled) setGroup(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Group not found</h2>
        <Link to={ROUTES.ADMIN_GROUPS}>
          <Button variant="primary">Back to Groups</Button>
        </Link>
      </div>
    );
  }

  const members = group.members ?? [];
  const memberCount = group.memberCount ?? members.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to={ROUTES.ADMIN_GROUPS}>
          <Button variant="outline" size="sm">← Back to Groups</Button>
        </Link>
        <div className="flex gap-2">
          {canManagePermissions && (
            <Link to={`${ROUTES.DASHBOARD}/admin/permissions/groups/${group.id}`}>
              <Button variant="primary" size="sm">Manage Permissions</Button>
            </Link>
          )}
        </div>
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{group.name}</h1>
        {group.description && (
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">{group.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-500">
          <span>{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>Created {formatDate(group.createdAt)}</span>
        </div>
        {members.length > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Members</h2>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <Badge key={m.id}>
                  {m.user.name || m.user.email} ({m.role})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
