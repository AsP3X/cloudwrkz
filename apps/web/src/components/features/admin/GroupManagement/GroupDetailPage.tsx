"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { updateGroup, addUserToGroup, removeUserFromGroup, getGroup } from "@/server/actions/groups";
import { getAllUsers } from "@/server/actions/users";
import { formatDate } from "@/lib/utils/date";
import { isDynamicTicketPermission } from "@/lib/utils/permissions";

type Group = NonNullable<Awaited<ReturnType<typeof getGroup>>>;

interface GroupDetailPageProps {
  group: Group;
  canManagePermissions?: boolean;
}

export function GroupDetailPage({ group: initialGroup, canManagePermissions = false }: GroupDetailPageProps) {
  const router = useRouter();
  const [group, setGroup] = useState(initialGroup);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getAllUsers>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: group.name, description: group.description || "" });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    getAllUsers().then(setUsers);
  }, []);

  // Sync group state when initialGroup changes (e.g., after router.refresh())
  React.useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await updateGroup(group.id, formData);
    setIsLoading(false);
    if (result.success) {
      setEditDialogOpen(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setError(null);
    setIsLoading(true);
    const result = await addUserToGroup(group.id, selectedUserId);
    setIsLoading(false);
    if (result.success) {
      setSelectedUserId("");
      setSearchQuery("");
      setAddMemberDialogOpen(false);
      // Reload the group data to update the UI immediately
      const updatedGroup = await getGroup(group.id);
      if (updatedGroup) {
        setGroup(updatedGroup);
      }
      // Also trigger router refresh for server component updates
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setIsLoading(true);
    const result = await removeUserFromGroup(group.id, userId);
    setIsLoading(false);
    if (result.success) {
      // Reload the group data to update the UI immediately
      const updatedGroup = await getGroup(group.id);
      if (updatedGroup) {
        setGroup(updatedGroup);
      }
      // Also trigger router refresh for server component updates
      router.refresh();
    }
  };

  // Filter available users (not already members) and by search query
  const availableUsers = users.filter(
    (user) => !group.members.some((m) => m.userId === user.id)
  );

  const filteredUsers = availableUsers.filter((user) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = user.name?.toLowerCase() || "";
    const email = user.email.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/dashboard/admin/groups" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
            ← Back to Groups
          </Link>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{group.name}</h1>
          {group.description && (
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">{group.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canManagePermissions && (
            <Link href={`/dashboard/admin/permissions/groups/${group.id}`}>
              <Button variant="outline">Manage Permissions</Button>
            </Link>
          )}
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            Edit Group
          </Button>
          <Button variant="primary" onClick={() => setAddMemberDialogOpen(true)}>
            Add Member
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Members</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{group._count.members}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{group._count.tickets}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Permissions</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{group._count.permissions || 0}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
            {formatDate(group.createdAt)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <Tabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Group Information</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Name:</span>
                        <span className="ml-2 text-neutral-900 dark:text-neutral-100">{group.name}</span>
                      </div>
                      {group.description && (
                        <div>
                          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Description:</span>
                          <p className="mt-1 text-neutral-900 dark:text-neutral-100">{group.description}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created:</span>
                        <span className="ml-2 text-neutral-900 dark:text-neutral-100">{formatDate(group.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Activated Permissions */}
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                      Activated Permissions ({group.permissions?.length || group._count?.permissions || 0})
                    </h3>
                    {(!group.permissions || group.permissions.length === 0) && (group._count?.permissions || 0) === 0 ? (
                      <p className="text-neutral-600 dark:text-neutral-400">
                        No permissions assigned to this group. Go to the Permissions tab to assign permissions.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {/* Group permissions by category */}
                        {(() => {
                          // Ensure we have permissions array
                          const permissionsArray = group.permissions || [];
                          
                          if (permissionsArray.length === 0 && (group._count?.permissions || 0) > 0) {
                            // Permissions count exists but array is empty - might need refresh
                            return (
                              <div className="p-4 bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 rounded-lg">
                                <p className="text-sm text-warning-800 dark:text-warning-200">
                                  Permissions data may be out of sync. Please refresh the page or manage permissions in the Permissions section.
                                </p>
                                <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                                  Expected {group._count?.permissions || 0} permissions but found {permissionsArray.length} in data.
                                </p>
                              </div>
                            );
                          }

                          const permissionsByCategory: Record<string, typeof group.permissions> = {};
                          const dynamicPermissions: typeof group.permissions = [];
                          
                          permissionsArray.forEach((gp) => {
                            if (!gp || !gp.permission) {
                              return;
                            }
                            
                            // Filter out dynamic permissions - they should only appear in the Dynamic section
                            // Dynamic permissions will be shown separately below
                            if (isDynamicTicketPermission(gp.permission.key)) {
                              dynamicPermissions.push(gp);
                              return;
                            }
                            
                            // Use category from permission, default to "other" if missing
                            const category = gp.permission.category || "other";
                            if (!permissionsByCategory[category]) {
                              permissionsByCategory[category] = [];
                            }
                            permissionsByCategory[category].push(gp);
                          });

                          // Sort categories alphabetically, but put "tickets" first if it exists
                          const sortedCategories = Object.entries(permissionsByCategory).sort(([a], [b]) => {
                            if (a === "tickets" && b !== "tickets") return -1;
                            if (a !== "tickets" && b === "tickets") return 1;
                            return a.localeCompare(b);
                          });

                          if (sortedCategories.length === 0) {
                            return (
                              <p className="text-neutral-600 dark:text-neutral-400">
                                No permissions found. Manage permissions in the Permissions section.
                              </p>
                            );
                          }

                          return (
                            <>
                              {/* Regular category sections */}
                              {sortedCategories.map(([category, permissions]) => (
                                <div
                                  key={category}
                                  className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden"
                                >
                                  <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
                                      {category.replace(/_/g, " ")} ({permissions.length})
                                    </h4>
                                  </div>
                                  <div className="p-4 bg-white dark:bg-neutral-800">
                                    <div className="space-y-2">
                                      {permissions
                                        .filter((gp) => gp && gp.permission) // Filter out any null/undefined entries
                                        .sort((a, b) => a.permission.key.localeCompare(b.permission.key))
                                        .map((gp) => {
                                          if (!gp || !gp.permission) {
                                            return null;
                                          }
                                          
                                          return (
                                            <div
                                              key={gp.permission.id}
                                              className="flex items-start gap-3 p-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                                            >
                                              <div className="flex-1">
                                                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                                  {gp.permission.name}
                                                </div>
                                                {gp.permission.description && (
                                                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                                    {gp.permission.description}
                                                  </div>
                                                )}
                                                <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 font-mono">
                                                  {gp.permission.key}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              {/* Dynamic Permissions Section */}
                              {dynamicPermissions.length > 0 && (
                                <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                                  <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                                    <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                                      Dynamic Permissions ({dynamicPermissions.length})
                                    </h4>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                      Ticket-specific permissions (e.g., tickets.TSK-000001.view)
                                    </p>
                                  </div>
                                  <div className="p-4 bg-white dark:bg-neutral-800">
                                    <div className="space-y-2">
                                      {dynamicPermissions
                                        .filter((gp) => gp && gp.permission)
                                        .sort((a, b) => a.permission.key.localeCompare(b.permission.key))
                                        .map((gp) => {
                                          if (!gp || !gp.permission) {
                                            return null;
                                          }
                                          
                                          return (
                                            <div
                                              key={gp.permission.id}
                                              className="flex items-start gap-3 p-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                                            >
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                  <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                                    {gp.permission.name}
                                                  </div>
                                                  <Badge variant="info" size="sm">Dynamic</Badge>
                                                </div>
                                                {gp.permission.description && (
                                                  <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                                    {gp.permission.description}
                                                  </div>
                                                )}
                                                <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 font-mono">
                                                  {gp.permission.key}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              id: "members",
              label: "Members",
              content: (
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Group Members</h3>
                  {group.members.length === 0 ? (
                    <p className="text-neutral-600 dark:text-neutral-400">No members in this group.</p>
                  ) : (
                    <div className="space-y-3">
                      {group.members.map((membership) => (
                        <div
                          key={membership.id}
                          className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-neutral-100">
                              {membership.user.name || membership.user.email}
                            </p>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="info" size="sm">{membership.user.role}</Badge>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleRemoveMember(membership.userId)}
                              disabled={isLoading}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
          defaultTab="overview"
        />
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Edit Group"
        description={`Edit ${group.name}`}
      >
        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog
        open={addMemberDialogOpen}
        onOpenChange={setAddMemberDialogOpen}
        title="Add Member to Group"
        description={`Add a user to ${group.name}`}
      >
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

          {availableUsers.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              All available users are already members of this group.
            </p>
          ) : (
            <>
              <Input
                label="Search Users"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedUserId(""); // Clear selection when searching
                }}
              />

              <div className="max-h-[300px] overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
                {filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-neutral-600 dark:text-neutral-400">
                    No users found matching your search.
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredUsers.map((user) => {
                      const isSelected = selectedUserId === user.id;
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => setSelectedUserId(user.id)}
                          className={`w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                            isSelected ? "bg-primary-50 dark:bg-primary-900/50 border-l-4 border-primary-600" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                {user.name || user.email}
                              </div>
                              {user.name && (
                                <div className="text-sm text-neutral-600 dark:text-neutral-400">{user.email}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="info" size="sm">{user.role}</Badge>
                              {isSelected && (
                                <svg
                                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              variant="outline"
              onClick={() => {
                setAddMemberDialogOpen(false);
                setSearchQuery("");
                setSelectedUserId("");
                setError(null);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddMember}
              disabled={!selectedUserId || isLoading}
              loading={isLoading}
            >
              Add Member
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
