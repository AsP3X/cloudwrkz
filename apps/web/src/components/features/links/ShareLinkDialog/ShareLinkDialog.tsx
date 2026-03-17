"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { shareLinkWithUser, unshareLink, getLinkShares, updateLinkShareRole } from "@/server/actions/links";
import { getAllUsers } from "@/server/actions/users";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkId: string;
  linkTitle: string;
}

type ShareEntry = {
  id: string;
  sharedWithUserId: string;
  role: "VIEWER" | "EDITOR";
  sharedWithUser: { id: string; name: string | null; email: string };
};

export function ShareLinkDialog({
  open,
  onOpenChange,
  linkId,
  linkTitle,
}: ShareLinkDialogProps) {
  const router = useRouter();
  const [users, setUsers] = React.useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState<"VIEWER" | "EDITOR">("VIEWER");
  const [shares, setShares] = React.useState<ShareEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      getAllUsers().then(setUsers);
      getLinkShares(linkId).then(setShares);
    }
  }, [open, linkId]);

  React.useEffect(() => {
    if (!open) {
      setSelectedUserId("");
      setSelectedRole("VIEWER");
      setError(null);
    }
  }, [open]);

  const availableUsers = users.filter((u) => !shares.some((s) => s.sharedWithUserId === u.id));

  const handleShare = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await shareLinkWithUser(linkId, selectedUserId, selectedRole);
      if (result.success) {
        const updated = await getLinkShares(linkId);
        setShares(updated);
        router.refresh();
        setSelectedUserId("");
        setSelectedRole("VIEWER");
      } else {
        setError(result.error || "Failed to share link");
      }
    } catch (err) {
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (sharedWithUserId: string, newRole: "VIEWER" | "EDITOR") => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await updateLinkShareRole(linkId, sharedWithUserId, newRole);
      if (result.success) {
        setShares((prev) =>
          prev.map((s) => (s.sharedWithUserId === sharedWithUserId ? { ...s, role: newRole } : s))
        );
        router.refresh();
      } else {
        setError(result.error || "Failed to update role");
      }
    } catch (err) {
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnshare = async (sharedWithUserId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await unshareLink(linkId, sharedWithUserId);
      if (result.success) {
        setShares((prev) => prev.filter((s) => s.sharedWithUserId !== sharedWithUserId));
        router.refresh();
      } else {
        setError(result.error || "Failed to remove share");
      }
    } catch (err) {
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share link"
      description={`Share "${linkTitle}" with another user. They will see it in Shared with me.`}
      className="max-w-2xl shadow-2xl"
      zIndex={60}
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
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Share with user
              </h3>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="share-link-user-select" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 min-h-5">
                  User
                </label>
                <Select
                  id="share-link-user-select"
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
              <div className="w-full sm:w-40 shrink-0">
                <label htmlFor="share-link-role-select" className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 min-h-5">
                  Access role
                </label>
                <Select
                  id="share-link-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as "VIEWER" | "EDITOR")}
                  options={[
                    { value: "VIEWER", label: "Viewer" },
                    { value: "EDITOR", label: "Editor" },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="pt-6 shrink-0">
                <Button
                  type="button"
                  onClick={handleShare}
                  disabled={!selectedUserId || isSubmitting}
                  variant="primary"
                >
                  Share
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide">
                Shared with ({shares.length})
              </h3>
            </div>
            {shares.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Not shared with anyone yet.</p>
            ) : (
              <div className="space-y-2">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/80 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {share.sharedWithUser.name || share.sharedWithUser.email}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {share.role === "EDITOR" ? "Editor" : "Viewer"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 shrink-0" title="Access role">
                        <Select
                          value={share.role}
                          onChange={(e) => handleUpdateRole(share.sharedWithUserId, e.target.value as "VIEWER" | "EDITOR")}
                          options={[
                            { value: "VIEWER", label: "Viewer" },
                            { value: "EDITOR", label: "Editor" },
                          ]}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnshare(share.sharedWithUserId)}
                        disabled={isSubmitting}
                        className="text-error-600 dark:text-error-400 border-error-300 dark:border-error-700 hover:bg-error-50 dark:hover:bg-error-950/30"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
