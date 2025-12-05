"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { createGroup, deleteGroup, type GroupInput } from "@/server/actions/groups";
import type { getGroups } from "@/server/actions/groups";

type Group = Awaited<ReturnType<typeof getGroups>>[0];

interface GroupManagementPageProps {
  initialGroups: Group[];
}

export function GroupManagementPage({ initialGroups }: GroupManagementPageProps) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<GroupInput>({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await createGroup(formData);
    setIsLoading(false);
    if (result.success) {
      setFormData({ name: "", description: "" });
      setCreateDialogOpen(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;
    setIsLoading(true);
    const result = await deleteGroup(selectedGroup.id);
    setIsLoading(false);
    if (result.success) {
      setDeleteDialogOpen(false);
      setSelectedGroup(null);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Group Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage agent groups ({groups.length} total)
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
          Create Group
        </Button>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No groups yet
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Create your first agent group to get started.
          </p>
          <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
            Create Group
          </Button>
        </div>
      ) : (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Tickets
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                {groups.map((group) => (
                  <tr
                    key={group.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {group.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md">
                        {group.description || (
                          <span className="text-neutral-400 dark:text-neutral-500">
                            No description
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        {group._count.members} member{group._count.members !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        {group._count.tickets} ticket{group._count.tickets !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/admin/groups/${group.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="Create Group"
        description="Create a new agent group"
      >
        <form onSubmit={handleCreate} className="p-6 space-y-4">
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
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isLoading}>
              Create Group
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Dialog */}
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
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isLoading}>
              Delete Group
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
