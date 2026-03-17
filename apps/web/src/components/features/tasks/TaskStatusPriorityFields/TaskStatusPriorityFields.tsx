"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { updateTodo } from "@/server/actions/todos";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

const STATUS_OPTIONS = [
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

interface TaskStatusPriorityFieldsProps {
  taskId: string;
  status: string;
  priority: string;
}

export const TaskStatusPriorityFields = ({
  taskId,
  status,
  priority,
}: TaskStatusPriorityFieldsProps) => {
  const router = useRouter();
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const statusOptions = STATUS_OPTIONS;
  const priorityOptions = PRIORITY_OPTIONS;

  const handleStatusChange = async (value: string) => {
    setIsUpdatingStatus(true);
    setError(null);

    try {
      const result = await updateTodo(taskId, { status: value as any });
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update status");
      }
    } catch (err) {
      console.error("Update status error:", err);
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (value: string) => {
    setIsUpdatingPriority(true);
    setError(null);

    try {
      const result = await updateTodo(taskId, { priority: value as any });
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update priority");
      }
    } catch (err) {
      console.error("Update priority error:", err);
      setError(getServerActionErrorMessage(err));
    } finally {
      setIsUpdatingPriority(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-3">
          <p className="text-xs font-medium text-error-800">{error}</p>
        </div>
      )}

      {/* Status */}
      <div>
        <label htmlFor="task-status" className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Status
        </label>
        <Select
          id="task-status"
          options={statusOptions}
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isUpdatingStatus}
          className="text-sm py-2"
        />
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="task-priority" className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Priority
        </label>
        <Select
          id="task-priority"
          options={priorityOptions}
          value={priority}
          onChange={(e) => handlePriorityChange(e.target.value)}
          disabled={isUpdatingPriority}
          className="text-sm py-2"
        />
      </div>
    </div>
  );
};
