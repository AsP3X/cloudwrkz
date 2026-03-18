import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { UserPermissionsManager } from "@/components/features/admin/UserPermissionsManager";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

export default function UserPermissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canView = can("admin.permissions.view") || can("admin.permissions.manage");
  const [user, setUser] = useState<UserData | null>(null);
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
        const data = await api.get<{ user: UserData }>(`/admin/users/${id}`);
        if (!cancelled && data.user) {
          setUser(data.user);
          const permRes = await api.get<{ permissions: unknown[] }>(`/admin/users/${id}/permissions`);
          if (!cancelled) setPermissionCount(permRes.permissions?.length ?? 0);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView, id]);

  const refreshCount = async () => {
    if (!id) return;
    try {
      const res = await api.get<{ permissions: unknown[] }>(`/admin/users/${id}/permissions`);
      setPermissionCount(res.permissions?.length ?? 0);
    } catch {}
  };

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to manage user permissions."
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

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-600 dark:text-neutral-400">User not found.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard/admin/permissions/users")}>
          Back to User Permissions
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
              to="/dashboard/admin/permissions/users"
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
            Manage permissions for this user. Permissions are additive — users get permissions from their role, groups, and direct user permissions.
          </p>
        </div>
        <Link to={`/dashboard/admin/users/${user.id}`}>
          <Button variant="outline">View User Details</Button>
        </Link>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {user.name || user.email}
            </h2>
            <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              <span><strong className="text-neutral-900 dark:text-neutral-100">Email:</strong> {user.email}</span>
              <span><strong className="text-neutral-900 dark:text-neutral-100">Role:</strong> {user.role}</span>
              <span><strong className="text-neutral-900 dark:text-neutral-100">Status:</strong> {user.status}</span>
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              <strong className="text-neutral-900 dark:text-neutral-100">{permissionCount}</strong> direct permission{permissionCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <UserPermissionsManager userId={user.id} onSave={refreshCount} />
      </div>
    </div>
  );
}
