"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { shareCollection, removeCollectionMember, updateCollectionMember } from "@/server/actions/collections";
import { getAllUsers } from "@/server/actions/users";

interface ShareCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  members: Array<{
    id: string;
    userId: string;
    role: "VIEWER" | "EDITOR";
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
}

export function ShareCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  members: initialMembers,
}: ShareCollectionDialogProps) {
  const router = useRouter();
  const [users, setUsers] = React.useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState<"VIEWER" | "EDITOR">("VIEWER");
  const [members, setMembers] = React.useState(initialMembers);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      getAllUsers().then((usersList) => {
        setUsers(usersList);
      });
      setMembers(initialMembers);
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
      const result = await shareCollection(collectionId, {
        userId: selectedUserId,
        role: selectedRole,
      });

      if (result.success) {
        // Refresh members list
        router.refresh();
        setSelectedUserId("");
        setSelectedRole("VIEWER");
      } else {
        setError(result.error || "Failed to share collection");
      }
    } catch (err) {
      setError("An unexpected error occurred");
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
      const result = await updateCollectionMember(collectionId, member.userId, newRole);
      if (result.success) {
        setMembers(
          members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
        );
        router.refresh();
      } else {
        setError(result.error || "Failed to update role");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (!confirm(`Remove ${member.user.name || member.user.email} from this collection?`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await removeCollectionMember(collectionId, member.userId);
      if (result.success) {
        setMembers(members.filter((m) => m.id !== memberId));
        router.refresh();
      } else {
        setError(result.error || "Failed to remove member");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter out users who are already members
  const availableUsers = users.filter(
    (user) => !members.some((m) => m.userId === user.id)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Collection"
      description="Share this collection with other users"
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-md">
            <p className="text-sm text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Add User
          </h3>
          <div className="flex gap-2">
            <Select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              options={[
                { value: "", label: "Select a user..." },
                ...availableUsers.map((user) => ({
                  value: user.id,
                  label: user.name || user.email,
                })),
              ]}
              className="flex-1"
            />
            <Select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as "VIEWER" | "EDITOR")}
              options={[
                { value: "VIEWER", label: "Viewer" },
                { value: "EDITOR", label: "Editor" },
              ]}
            />
            <Button
              type="button"
              onClick={handleShare}
              disabled={!selectedUserId || isSubmitting}
              variant="primary"
            >
              Add
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Members ({members.length})
          </h3>
          {members.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md"
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
                    <Select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value as "VIEWER" | "EDITOR")}
                      options={[
                        { value: "VIEWER", label: "Viewer" },
                        { value: "EDITOR", label: "Editor" },
                      ]}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      onClick={() => handleRemove(member.id)}
                      disabled={isSubmitting}
                      variant="outline"
                      className="text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
