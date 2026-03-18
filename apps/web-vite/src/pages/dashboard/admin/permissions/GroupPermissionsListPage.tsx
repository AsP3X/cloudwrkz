import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import type { AdminGroup } from "@/lib/types";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

export default function GroupPermissionsListPage() {
  const { can } = useAuth();
  const canView = can("admin.permissions.view") || can("admin.permissions.manage");
  const [groups, setGroups] = useState<AdminGroup[]>([]);
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
        const data = await api.get<{ groups: AdminGroup[] }>("/admin/groups");
        if (!cancelled) setGroups(data.groups ?? []);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView]);

  const filteredGroups = useMemo(() => {
    if (!localSearch.trim()) return groups;
    const q = localSearch.toLowerCase();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? "").toLowerCase().includes(q)
    );
  }, [groups, localSearch]);

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to manage group permissions."
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Group Permissions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for groups ({groups.length} total
            {localSearch.trim() && filteredGroups.length !== groups.length ? `, ${filteredGroups.length} shown` : ""})
          </p>
        </div>
      </div>

      {filteredGroups.length > 0 && (
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Showing {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                label="Search"
                placeholder="Search by group name or description..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Link to="/dashboard/admin/groups">
                <Button variant="outline">Manage Groups</Button>
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-500 dark:text-neutral-400">Loading...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center">
            {localSearch.trim() ? (
              <>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No groups found</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">No groups match your search.</p>
                <Button variant="outline" onClick={() => setLocalSearch("")}>Clear Search</Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No groups yet</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">No groups found in the system.</p>
                <Link to="/dashboard/admin/groups">
                  <Button variant="primary">Go to Group Management</Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Group</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Members</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Permissions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredGroups.map((group) => (
                  <tr key={group.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{group.name}</div>
                        {group.description && (
                          <div className="text-sm text-neutral-600 dark:text-neutral-400 truncate max-w-md">{group.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="default" size="sm">
                        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">
                        {group.permissionCount ?? 0} permission{(group.permissionCount ?? 0) !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link to={`/dashboard/admin/permissions/groups/${group.id}`}>
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
