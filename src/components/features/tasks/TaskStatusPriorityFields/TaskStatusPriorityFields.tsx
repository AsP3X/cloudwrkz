"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { updateTodo } from "@/server/actions/todos";

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

  const statusOptions = [
    { value: "NOT_STARTED", label: "Not Started" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "BLOCKED", label: "Blocked" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

  const priorityOptions = [
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "URGENT", label: "Urgent" },
  ];

  const handleStatusChange = async (value: string) => {
    setIsUpdatingStatus(true);
    setError(null);

    try {
    const result = await updateTodo(taskId, {
        status: value as "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED",
      });

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update status");
      }
    } catch (err) {
      console.error("Update task status error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (value: string) => {
    setIsUpdatingPriority(true);
    setError(null);

    try {
      const result = await updateTodo(taskId, {
        priority: value as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      });

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update priority");
      }
    } catch (err) {
      console.error("Update task priority error:", err);
      setError("An unexpected error occurred");
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
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Status
        </label>
        <Select
          options={statusOptions}
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isUpdatingStatus}
          className="text-sm py-2"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Priority
        </label>
        <Select
          options={priorityOptions}
          value={priority}
          onChange={(e) => handlePriorityChange(e.target.value)}
          disabled={isUpdatingPriority}
          className="text-sm py-2"
        />
      </div>
    </div>
  );
}
