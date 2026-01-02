"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateTicket } from "@/server/actions/tickets";

interface Agent {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
}

interface TicketAssignmentFieldsProps {
  ticketId: string;
  assignedToId: string | null;
  assignedToGroupId: string | null;
  agents: Agent[];
  groups: Group[];
}

export const TicketAssignmentFields = ({
  ticketId,
  assignedToId,
  assignedToGroupId,
  agents,
  groups,
}: TicketAssignmentFieldsProps) => {
  const router = useRouter();
  const [isUpdatingAgent, setIsUpdatingAgent] = React.useState(false);
  const [isUpdatingGroup, setIsUpdatingGroup] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const agentOptions = [
    { value: "", label: "Unassigned" },
    ...agents.map((agent) => ({
      value: agent.id,
      label: agent.name || agent.email,
    })),
  ];

  const groupOptions = [
    { value: "", label: "No group assignment" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];

  const handleAgentChange = async (value: string) => {
    setIsUpdatingAgent(true);
    setError(null);

    try {
      const result = await updateTicket(
        ticketId,
        {
          assignedToId: value === "" ? null : value,
        } as Parameters<typeof updateTicket>[1]
      );

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update assignment");
      }
    } catch (err) {
      console.error("Update assignment error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsUpdatingAgent(false);
    }
  };

  const handleGroupChange = async (value: string) => {
    setIsUpdatingGroup(true);
    setError(null);

    try {
      const result = await updateTicket(ticketId, {
        assignedToGroupId: value === "" ? null : value,
      } as Parameters<typeof updateTicket>[1]);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update group assignment");
      }
    } catch (err) {
      console.error("Update group assignment error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-3">
          <p className="text-xs font-medium text-error-800">{error}</p>
        </div>
      )}

      {/* Assigned To */}
      <div>
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Assigned To
        </label>
        <Select
          options={agentOptions}
          value={assignedToId || ""}
          onChange={(e) => handleAgentChange(e.target.value)}
          disabled={isUpdatingAgent}
          className="text-sm py-2"
        />
      </div>

      {/* Assigned To Group */}
      <div>
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Assigned To Group
        </label>
        <Select
          options={groupOptions}
          value={assignedToGroupId || ""}
          onChange={(e) => handleGroupChange(e.target.value)}
          disabled={isUpdatingGroup || groups.length === 0}
          className="text-sm py-2"
        />
      </div>
    </div>
  );
};
