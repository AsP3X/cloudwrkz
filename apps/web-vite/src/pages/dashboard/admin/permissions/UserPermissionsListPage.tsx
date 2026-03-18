import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { AdminUser } from "@/lib/types";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "ADMIN": return "error" as const;
    case "MODERATOR": return "warning" as const;
    case "AGENT": return "info" as const;
    default: return "default" as const;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "ACTIVE": return "success" as const;
    case "BANNED": return "error" as const;
    default: return "default" as const;
  }
};

export default function UserPermissionsListPage() {
  const { can } = useAuth();
  const canView = can("admin.permissions.view") || can("admin.permissions.manage");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "200");
        params.set("offset", "0");
        const data = await api.get<{ users: AdminUser[]; total: number }>(`/admin/users?${params.toString()}`);
        if (!cancelled) setUsers(data.users ?? []);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView]);

  const filteredUsers = useMemo(() => {
    if (!localSearch.trim()) return users;
    const q = localSearch.toLowerCase();
    return users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [users, localSearch]);

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to manage user permissions."
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">User Permissions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for individual users ({users.length} total
            {localSearch.trim() && filteredUsers.length !== users.length ? `, ${filteredUsers.length} shown` : ""})
          </p>
        </div>
      </div>

      {filteredUsers.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50">
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
              <Link to="/dashboard/admin/users">
                <Button variant="outline">Manage Users</Button>
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-500 dark:text-neutral-400">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            {localSearch.trim() ? (
              <>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No users found</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">No users match your search.</p>
                <Button variant="outline" onClick={() => setLocalSearch("")}>Clear Search</Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No users yet</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">No users found in the system.</p>
                <Link to="/dashboard/admin/users">
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
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Direct Permissions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{user.name || user.email}</div>
                          {user.name && <div className="text-sm text-neutral-600 dark:text-neutral-400">{user.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getRoleBadgeVariant(user.role)} size="sm">{user.role}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(user.status)} size="sm">{user.status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">
                        {user.permissionCount ?? 0} permission{(user.permissionCount ?? 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link to={`/dashboard/admin/permissions/users/${user.id}`}>
                        <Button variant="primary" size="sm">Manage Permissions</Button>
                      </Link>
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
