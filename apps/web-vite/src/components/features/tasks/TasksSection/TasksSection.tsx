import React from "react";
import { TaskViewToggle, getInitialTaskViewMode, saveTaskViewMode } from "../TaskViewToggle";
import type { TaskViewMode } from "../TaskViewToggle";
import { TaskList } from "../TaskList/TaskList";
import type { Todo } from "@/lib/types";

// Human: React UI for `TasksSection` in tasks and todo lists: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tasks; BULK filters forms; EXPORTS TasksSection; REACT component; READS props hooks; MAY CALL api client.
export interface TasksSectionProps {
  ticketId: string;
  tasks: Todo[];
  canManage: boolean;
  onRefresh?: () => void;
}

export function TasksSection({
  ticketId,
  tasks,
  canManage,
  onRefresh,
}: TasksSectionProps) {
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");

  React.useLayoutEffect(() => {
    setViewMode(getInitialTaskViewMode());
  }, []);

  const handleViewChange = (mode: TaskViewMode) => {
    setViewMode(mode);
    saveTaskViewMode(mode);
  };

  const displayMode = viewMode === "kanban" ? "table" : viewMode;

  if (!tasks.length && !canManage) {
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
        <TaskViewToggle
          currentView={viewMode}
          onViewChange={handleViewChange}
          showKanban={false}
        />
      </div>

      <TaskList
        ticketId={ticketId}
        tasks={tasks}
        viewMode={displayMode}
        canManage={canManage}
        onRefresh={onRefresh}
      />
    </div>
  );
}
