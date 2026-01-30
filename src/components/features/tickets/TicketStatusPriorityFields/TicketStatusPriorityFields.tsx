"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { updateTicket } from "@/server/actions/tickets";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

interface TicketStatusPriorityFieldsProps {
  ticketId: string;
  status: string;
  priority: string;
}

export const TicketStatusPriorityFields = ({
  ticketId,
  status,
  priority,
}: TicketStatusPriorityFieldsProps) => {
  const router = useRouter();
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const statusOptions = [
    { value: "OPEN", label: "Open" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "PENDING", label: "Pending" },
    { value: "RESOLVED", label: "Resolved" },
    { value: "CLOSED", label: "Closed" },
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
      const result = await updateTicket(ticketId, {
        status: value as "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "CANCELLED",
      });

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
      const result = await updateTicket(ticketId, {
        priority: value as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      });

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
};
