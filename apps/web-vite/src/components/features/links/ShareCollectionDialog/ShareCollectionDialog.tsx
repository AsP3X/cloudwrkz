import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/api/client";

// Human: React UI for `ShareCollectionDialog` in saved links and collections: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; EXPORTS ShareCollectionDialog; REACT component; READS props hooks; MAY CALL api client.
export interface CollectionMemberRow {
  id: string;
  user_id: string;
  role: "VIEWER" | "EDITOR";
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ShareCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  members: CollectionMemberRow[];
  owner: { id: string; name: string | null; email: string };
  onUpdated?: () => void;
}

export function ShareCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  members: initialMembers,
  owner,
  onUpdated,
}: ShareCollectionDialogProps) {
  const [users, setUsers] = React.useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState<"VIEWER" | "EDITOR">("VIEWER");
  const [members, setMembers] = React.useState(initialMembers);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setMembers(initialMembers);
      api
        .get<{ users: Array<{ id: string; name: string | null; email: string }> }>("/users")
        .then((res) => setUsers(res.users ?? []))
        .catch(() => setUsers([]));
    }
  }, [open, initialMembers]);

  React.useEffect(() => {
    if (!open) {
      setSelectedUserId("");
      setSelectedRole("VIEWER");
      setError(null);
    }
  }, [open]);

  const handleShare = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post(`/collections/${collectionId}/members`, {
        user_id: selectedUserId,
        role: selectedRole,
      });
      const full = await api.get<{
        collection: { members?: CollectionMemberRow[] };
      }>(`/collections/${collectionId}`);
      if (full.collection?.members) {
        setMembers(full.collection.members);
      }
      setSelectedUserId("");
      setSelectedRole("VIEWER");
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to share collection";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: "VIEWER" | "EDITOR") => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.patch(`/collections/${collectionId}/members/${member.user_id}`, { role: newRole });
      setMembers(members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to update role";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (!window.confirm(`Remove ${member.user.name || member.user.email} from this collection?`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.delete(`/collections/${collectionId}/members/${member.user_id}`);
      setMembers(members.filter((m) => m.id !== memberId));
      onUpdated?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to remove member";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableUsers = users.filter((u) => !members.some((m) => m.user_id === u.id) && u.id !== owner.id);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Collection"
      description="Share this collection with other users"
      className="max-w-2xl shadow-2xl"
    >
      <div className="px-4 sm:px-6 py-4 sm:py-6">
        {error && (
          <div className="mb-6 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-lg">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">Add user</h3>
            </div>
            <div className="flex flex-nowrap items-start gap-3">
              <div className="flex-1 min-w-0">
                <label htmlFor="share-user-select" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 min-h-5">
                  User
                </label>
                <Select
                  id="share-user-select"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  options={[
                    { value: "", label: "Select a user..." },
                    ...availableUsers.map((u) => ({
                      value: u.id,
                      label: u.name || u.email,
                    })),
                  ]}
                  className="w-full"
                />
              </div>
              <div className="w-36 shrink-0">
                <label htmlFor="share-role-select" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 min-h-5">
                  Role
                </label>
                <Select
                  id="share-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as "VIEWER" | "EDITOR")}
                  options={[
                    { value: "VIEWER", label: "Viewer" },
                    { value: "EDITOR", label: "Editor" },
                  ]}
                />
              </div>
              <div className="pt-6 shrink-0">
                <Button type="button" onClick={handleShare} disabled={!selectedUserId || isSubmitting} variant="primary">
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Members (1 owner + {members.length} shared)
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/80 rounded-lg border border-neutral-200 dark:border-neutral-700">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{owner.name || owner.email}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Owner</p>
                </div>
              </div>
              {members.length > 0 &&
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/80 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {member.user.name || member.user.email}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {member.role === "EDITOR" ? "Editor" : "Viewer"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 shrink-0">
                        <Select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.id, e.target.value as "VIEWER" | "EDITOR")}
                          options={[
                            { value: "VIEWER", label: "Viewer" },
                            { value: "EDITOR", label: "Editor" },
                          ]}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleRemove(member.id)}
                        disabled={isSubmitting}
                        variant="outline"
                        className="text-error-600 dark:text-error-400 border-error-300 dark:border-error-700 hover:bg-error-50 dark:hover:bg-error-950/30"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
