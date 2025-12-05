"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateTicket } from "@/server/actions/tickets";
import { ProjectAssignmentDialog } from "../ProjectAssignmentDialog";

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

interface Project {
  id: string;
  code: string;
  name: string;
  color: string | null;
  status: string;
}

interface TicketAssignmentFieldsProps {
  ticketId: string;
  assignedToId: string | null;
  assignedToGroupId: string | null;
  projectId: string | null;
  agents: Agent[];
  groups: Group[];
  projects: Project[];
}

export const TicketAssignmentFields = ({
  ticketId,
  assignedToId,
  assignedToGroupId,
  projectId,
  agents,
  groups,
  projects,
}: TicketAssignmentFieldsProps) => {
  const router = useRouter();
  const [isUpdatingAgent, setIsUpdatingAgent] = React.useState(false);
  const [isUpdatingGroup, setIsUpdatingGroup] = React.useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = React.useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);
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

  const handleProjectSelect = async (selectedProjectId: string | null) => {
    setIsUpdatingProject(true);
    setError(null);

    try {
      const result = await updateTicket(ticketId, {
        projectId: selectedProjectId,
      } as Parameters<typeof updateTicket>[1]);

      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update project assignment");
      }
    } catch (err) {
      console.error("Update project assignment error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsUpdatingProject(false);
    }
  };

  const currentProject = projects.find((p) => p.id === projectId);

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

      {/* Project Assignment */}
      <div>
        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
          Project
        </label>
        <Button
          variant="outline"
          onClick={() => setProjectDialogOpen(true)}
          disabled={isUpdatingProject}
          className="w-full justify-start text-sm py-2 h-auto"
        >
          <div className="flex items-center gap-2 w-full">
            {currentProject ? (
              <>
                {currentProject.color && (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: currentProject.color }}
                  />
                )}
                <span className="flex-1 text-left truncate">
                  {currentProject.name}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
                  {currentProject.code}
                </span>
              </>
            ) : (
              <span className="text-neutral-500 dark:text-neutral-400">
                No project assigned
              </span>
            )}
          </div>
        </Button>
      </div>

      {/* Project Assignment Dialog */}
      <ProjectAssignmentDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        projects={projects}
        currentProjectId={projectId}
        onSelect={handleProjectSelect}
        isLoading={isUpdatingProject}
      />
    </div>
  );
};
