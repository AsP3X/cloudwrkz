"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { updateGroup, addAgentToGroup, removeAgentFromGroup, getAgents } from "@/server/actions/groups";
import type { getGroup } from "@/server/actions/groups";

type Group = NonNullable<Awaited<ReturnType<typeof getGroup>>>;

interface GroupDetailPageProps {
  group: Group;
}

export function GroupDetailPage({ group: initialGroup }: GroupDetailPageProps) {
  const router = useRouter();
  const [group, setGroup] = useState(initialGroup);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [agents, setAgents] = useState<Awaited<ReturnType<typeof getAgents>>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: group.name, description: group.description || "" });
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    getAgents().then(setAgents);
  }, []);

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

  const handleAddAgent = async () => {
    if (!selectedAgentId) return;
    setError(null);
    setIsLoading(true);
    const result = await addAgentToGroup(group.id, selectedAgentId);
    setIsLoading(false);
    if (result.success) {
      setSelectedAgentId("");
      setAddAgentDialogOpen(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const handleRemoveAgent = async (agentId: string) => {
    setIsLoading(true);
    const result = await removeAgentFromGroup(group.id, agentId);
    setIsLoading(false);
    if (result.success) {
      router.refresh();
    }
  };

  const availableAgents = agents.filter(
    (agent) => !group.members.some((m) => m.userId === agent.id)
  );

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
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            Edit Group
          </Button>
          <Button variant="primary" onClick={() => setAddAgentDialogOpen(true)}>
            Add Agent
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Members</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{group._count.members}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{group._count.tickets}</p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
            {new Date(group.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Members</h2>
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
                    onClick={() => handleRemoveAgent(membership.userId)}
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

      {/* Add Agent Dialog */}
      <Dialog
        open={addAgentDialogOpen}
        onOpenChange={setAddAgentDialogOpen}
        title="Add Agent to Group"
        description={`Add an agent to ${group.name}`}
      >
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

          {availableAgents.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">
              All available agents are already members of this group.
            </p>
          ) : (
            <Select
              label="Select Agent"
              options={availableAgents.map((agent) => ({
                value: agent.id,
                label: `${agent.name || agent.email} (${agent.role})`,
              }))}
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            />
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setAddAgentDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddAgent}
              disabled={!selectedAgentId || isLoading}
              loading={isLoading}
            >
              Add Agent
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
