"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { updateTask } from "@/server/actions/tasks";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

interface TaskAssigneeFieldProps {
  taskId: string;
  assignedToId: string | null;
  users: UserOption[];
}

export const TaskAssigneeField = ({ taskId, assignedToId, users }: TaskAssigneeFieldProps) => {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const options = [
    { value: "", label: "Unassigned" },
    ...users.map((u) => ({
      value: u.id,
      label: u.name || u.email,
    })),
  ];

  const handleChange = async (value: string) => {
    setIsUpdating(true);
    setError(null);

    try {
      const result = await updateTask(taskId, {
        assignedToId: value === "" ? "" : value,
      });

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update assignment");
      }
    } catch (err) {
      console.error("Update task assignee error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-2">
          <p className="text-xs font-medium text-error-800">{error}</p>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
          Assigned To
        </label>
        <Select
          options={options}
          value={assignedToId || ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isUpdating}
          className="text-sm py-2"
        />
      </div>
    </div>
  );
}
