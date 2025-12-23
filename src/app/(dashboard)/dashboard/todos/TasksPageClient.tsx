"use client";

import React from "react";
import Link from "next/link";
import { TaskViewToggle, getInitialTaskViewMode, TaskViewMode, saveTaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { StandaloneTaskList } from "@/components/features/tasks/StandaloneTaskList";
import { Button } from "@/components/ui/Button";
import { TaskFilterButton } from "@/components/features/tasks/TaskFilterButton";

type Task = {
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
  parentTask?: {
    id: string;
    title: string;
  } | null;
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
  _count?: {
    subtasks: number;
  };
};

interface TasksPageClientProps {
  tasks: Task[];
  canManage: boolean;
  userRole: string;
  userTimezone?: string;
}

export function TasksPageClient({ tasks, canManage, userRole, userTimezone = "UTC" }: TasksPageClientProps) {
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");
  const [isReady, setIsReady] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useLayoutEffect(() => {
    // Sync from localStorage on mount to avoid hydration mismatch
    const initial = getInitialTaskViewMode();

    const updateIsDesktop = () => {
      const desktop = window.innerWidth >= 768; // md breakpoint
      setIsDesktop(desktop);

      // If user had Kanban selected but we're on mobile, fall back to table
      if (!desktop && initial === "kanban") {
        setViewMode("table");
        saveTaskViewMode("table");
      } else {
        setViewMode(initial);
      }
    };

    updateIsDesktop();
    window.addEventListener("resize", updateIsDesktop);

    setIsReady(true);

    return () => {
      window.removeEventListener("resize", updateIsDesktop);
    };
  }, []);

  const handleViewChange = (mode: TaskViewMode) => {
    setViewMode(mode);
    saveTaskViewMode(mode);
  };

  // Tasks are independent - no project filtering needed

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            ToDos
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Create and manage todos across all your projects. Todos can work independently or be linked to tickets when needed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isReady && (
            <TaskViewToggle
              currentView={viewMode === "kanban" && !isDesktop ? "table" : viewMode}
              onViewChange={handleViewChange}
              showKanban={isDesktop}
            />
          )}
          <TaskFilterButton />
          {canManage && (
            <Link href="/dashboard/todos/new">
              <Button variant="primary">Create</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No todos yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">Get started by creating your first todo</p>
          {canManage && (
            <Link href="/dashboard/todos/new">
              <Button variant="primary">Create</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {isReady ? (
            <>
              <div className="flex items-center justify-between mb-3 text-sm text-neutral-600 dark:text-neutral-400">
                <span>
                  Showing {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <StandaloneTaskList
                tasks={tasks}
                viewMode={viewMode}
                canManage={canManage}
                userTimezone={userTimezone}
              />
            </>
          ) : (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
              <div className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
