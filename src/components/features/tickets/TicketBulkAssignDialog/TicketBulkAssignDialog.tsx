"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { getAllUsers } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";

interface TicketBulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (assignedToId: string | null, assignedToGroupId: string | null) => void;
  selectedCount: number;
}

export const TicketBulkAssignDialog = ({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
}: TicketBulkAssignDialogProps) => {
  const [assignedToId, setAssignedToId] = React.useState<string>("");
  const [assignedToGroupId, setAssignedToGroupId] = React.useState<string>("");
  const [users, setUsers] = React.useState<Array<{ id: string; name: string | null; email: string; role: string }>>([]);
  const [groups, setGroups] = React.useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Fetch users and groups when dialog opens
  React.useEffect(() => {
    if (open) {
      setIsLoading(true);
      Promise.all([getAllUsers(), getGroups()])
        .then(([usersData, groupsData]) => {
          setUsers(usersData || []);
          setGroups(groupsData || []);
        })
        .catch((err) => {
          console.error("Failed to load users/groups:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // Reset form when dialog closes
      setAssignedToId("");
      setAssignedToGroupId("");
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm(
      assignedToId === "" ? null : assignedToId,
      assignedToGroupId === "" ? null : assignedToGroupId
    );
  };

  const agentOptions = [
    { value: "", label: "Unassigned" },
    ...users
      .filter((user) => ["AGENT", "ADMIN", "MODERATOR"].includes(user.role || ""))
      .map((user) => ({
        value: user.id,
        label: user.name || user.email,
      })),
  ];

  const groupOptions = [
    { value: "", label: "No group assignment" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Assign ${selectedCount} Ticket${selectedCount !== 1 ? "s" : ""}`}
      description="Assign the selected tickets to an agent or group"
    >
      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-neutral-600 dark:text-neutral-400">
            Loading...
          </div>
        ) : (
          <>
            {/* Assigned To */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                Assign To Agent
              </label>
              <Select
                options={agentOptions}
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Assigned To Group */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                Assign To Group
              </label>
              <Select
                options={groupOptions}
                value={assignedToGroupId}
                onChange={(e) => setAssignedToGroupId(e.target.value)}
                disabled={groups.length === 0}
                className="text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
              >
                Assign
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
