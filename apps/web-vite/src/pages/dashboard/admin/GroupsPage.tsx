import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import type { AdminGroup } from "@/lib/types";
import { PERM } from "@/lib/permissions";

// Human: Admin directory of groups with create/delete dialogs, client-side search, and membership summaries.
// Agent: GET /admin/groups; PERM gate admin.groups.view|manage; STATE dialogs+formData; MUTATES groups list after actions.

export default function GroupsPage() {
  const { can } = useAuth();
  const canViewGroups = can(PERM.ADMIN_GROUPS_VIEW) || can(PERM.ADMIN_GROUPS_MANAGE);
  const canManageGroups = can(PERM.ADMIN_GROUPS_MANAGE);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<AdminGroup | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ groups: AdminGroup[] }>("/admin/groups");
      setGroups(data.groups || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const filteredGroups = useMemo(() => {
    if (!localSearch.trim()) return groups;
    const searchLower = localSearch.toLowerCase();
    return groups.filter((group) => {
      const name = group.name.toLowerCase();
      const description = (group.description || "").toLowerCase();
      return name.includes(searchLower) || description.includes(searchLower);
    });
  }, [groups, localSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    try {
      await api.post("/admin/groups", formData);
      setFormData({ name: "", description: "" });
      setCreateDialogOpen(false);
      setSuccess("Group created successfully");
      fetchGroups();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to create group");
    }
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/admin/groups/${selectedGroup.id}`);
      setDeleteDialogOpen(false);
      setSelectedGroup(null);
      setSuccess("Group deleted successfully");
      fetchGroups();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to delete group");
    }
    setIsLoading(false);
  };

  if (!canViewGroups) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-error-400 hover:text-error-600 dark:hover:text-error-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            </div>
            <button onClick={() => setSuccess(null)} className="text-success-400 hover:text-success-600 dark:hover:text-success-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Group Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage agent groups ({groups.length} total{localSearch.trim() && filteredGroups.length !== groups.length ? `, ${filteredGroups.length} shown` : ""})
          </p>
        </div>
        {canManageGroups && (
          <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
            Create Group
          </Button>
        )}
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
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
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center">
            {localSearch.trim() ? (
              <>
                <svg className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No groups found</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">No groups match your search criteria.</p>
                <Button variant="outline" onClick={() => setLocalSearch("")}>Clear Search</Button>
              </>
            ) : (
              <>
                <svg className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No groups yet</h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">Create your first agent group to get started.</p>
                {canManageGroups && (
                  <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>Create Group</Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Group</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Members</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredGroups.map((group) => (
                  <tr key={group.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-neutral-400 dark:text-neutral-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{group.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
                        {group.description || <span className="text-neutral-400 dark:text-neutral-500 italic">No description</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="default" size="sm">
                        {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/dashboard/admin/groups/${group.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        {canManageGroups && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedGroup(group);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} title="Create Group" description="Create a new agent group">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <Input
            label="Group Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isLoading}>Cancel</Button>
            <Button type="submit" variant="primary" loading={isLoading}>Create Group</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Group"
        description={selectedGroup ? `Are you sure you want to delete ${selectedGroup.name}?` : ""}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg mb-4">
            <p className="text-sm text-error-700 dark:text-error-300">
              This will permanently delete the group. This action cannot be undone.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={isLoading}>Delete Group</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
