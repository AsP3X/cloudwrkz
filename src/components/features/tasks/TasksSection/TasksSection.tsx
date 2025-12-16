"use client";

import React from "react";
import { TaskViewToggle, getInitialTaskViewMode, TaskViewMode, saveTaskViewMode } from "../TaskViewToggle";
import { TaskList } from "../TaskList";

type TicketTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: Date | null;
  dueDate: Date | null;
  completedDate: Date | null;
  estimatedHours: number | null;
  actualHours: number | null;
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

interface TasksSectionProps {
  ticketId: string;
  tasks: TicketTask[];
  canManage: boolean;
  ticketHasProject: boolean;
}

export const TasksSection = ({
  ticketId,
  tasks,
  canManage,
  ticketHasProject,
}: TasksSectionProps) => {
  // Initialize with default to avoid hydration mismatch, then sync from localStorage on client
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");
  const [isReady, setIsReady] = React.useState(false);

  React.useLayoutEffect(() => {
    // Sync from localStorage on mount to avoid hydration mismatch
    const initial = getInitialTaskViewMode();
    setViewMode(initial);
    setIsReady(true);
  }, []);

  const handleViewChange = (mode: TaskViewMode) => {
    setViewMode(mode);
    saveTaskViewMode(mode);
  };

  if (!ticketHasProject && !tasks.length) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100">
            Tasks for this ticket
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Track follow-up todos and smaller work items that belong to this ticket.
          </p>
        </div>
        {isReady && (
          <TaskViewToggle currentView={viewMode} onViewChange={handleViewChange} />
        )}
      </div>

      {!ticketHasProject && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          This ticket is not linked to a project. To create tasks, first assign the ticket to a project
          from the ticket information panel.
        </div>
      )}

      {ticketHasProject && (
        <TaskList
          ticketId={ticketId}
          tasks={tasks}
          viewMode={isReady ? viewMode : "table"}
          canManage={canManage}
        />
      )}
    </div>
  );
};

