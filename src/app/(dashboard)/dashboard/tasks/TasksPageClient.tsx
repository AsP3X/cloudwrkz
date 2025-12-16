"use client";

import React from "react";
import Link from "next/link";
import { TaskViewToggle, getInitialTaskViewMode, TaskViewMode, saveTaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { StandaloneTaskList } from "@/components/features/tasks/StandaloneTaskList";
import { Button } from "@/components/ui/Button";

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
};

interface TasksPageClientProps {
  initialTasks: Task[];
  canManage: boolean;
  userRole: string;
}

export function TasksPageClient({ initialTasks, canManage, userRole }: TasksPageClientProps) {
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");
  const [isReady, setIsReady] = React.useState(false);
  const [filteredTasks, setFilteredTasks] = React.useState<Task[]>(initialTasks);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  React.useLayoutEffect(() => {
    // Sync from localStorage on mount to avoid hydration mismatch
    const initial = getInitialTaskViewMode();
    setViewMode(initial);
    setIsReady(true);
  }, []);

  React.useEffect(() => {
    // Separate completed tasks - they always show in their own section
    const completedTasks = initialTasks.filter((task) => task.status === "COMPLETED");
    const activeTasks = initialTasks.filter((task) => task.status !== "COMPLETED");

    // Filter active tasks by status filter
    let filteredActive = activeTasks;
    if (statusFilter !== "all" && statusFilter !== "COMPLETED") {
      filteredActive = activeTasks.filter((task) => task.status === statusFilter);
    }

    // Always include all completed tasks in a separate section
    // Combine filtered active tasks with all completed tasks
    const filtered = [...filteredActive, ...completedTasks];

    setFilteredTasks(filtered);
  }, [initialTasks, statusFilter]);

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
            Tasks
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Create and manage tasks across all your projects. Tasks can work independently or be linked to tickets when needed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isReady && (
            <TaskViewToggle currentView={viewMode} onViewChange={handleViewChange} />
          )}
          {canManage && (
            <Link href="/dashboard/tasks/new">
              <Button variant="primary">Create</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-neutral-600 dark:text-neutral-400">
            {filteredTasks.filter((t) => t.status !== "COMPLETED").length}{" "}
            {filteredTasks.filter((t) => t.status !== "COMPLETED").length === 1 ? "task" : "tasks"}
            {filteredTasks.filter((t) => t.status === "COMPLETED").length > 0 && (
              <span className="ml-2">
                ({filteredTasks.filter((t) => t.status === "COMPLETED").length} completed)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Task List */}
      {initialTasks.length === 0 ? (
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
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No tasks yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">Get started by creating your first task</p>
          {canManage && (
            <Link href="/dashboard/tasks/new">
              <Button variant="primary">Create</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          {isReady ? (
            <StandaloneTaskList
              tasks={filteredTasks}
              viewMode={viewMode}
              canManage={canManage}
            />
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
