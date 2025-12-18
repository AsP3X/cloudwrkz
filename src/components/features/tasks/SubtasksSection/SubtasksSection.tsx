"use client";

import React from "react";
import { TaskViewToggle, TaskViewMode } from "../TaskViewToggle";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { useRouter } from "next/navigation";
import { createSubtask, updateTask } from "@/server/actions/tasks";
import Link from "next/link";

type Subtask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: Date | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

interface SubtasksSectionProps {
  parentTaskId: string;
  subtasks: Subtask[];
  canManage: boolean;
  viewMode?: TaskViewMode;
  onViewChange?: (mode: TaskViewMode) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "NOT_STARTED":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    case "IN_PROGRESS":
      return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
    case "BLOCKED":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "COMPLETED":
      return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
    case "CANCELLED":
      return "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
};

const getPriorityColor = (priority?: string) => {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "HIGH":
      return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
    case "MEDIUM":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
    case "LOW":
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
};

export const SubtasksSection = ({ parentTaskId, subtasks, canManage, viewMode: externalViewMode, onViewChange: externalOnViewChange }: SubtasksSectionProps) => {
  const router = useRouter();
  const [internalViewMode, setInternalViewMode] = React.useState<TaskViewMode>("table");
  const [mounted, setMounted] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [newPriority, setNewPriority] = React.useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");

  // Mark as mounted after hydration
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Use external view mode if provided, otherwise use internal state
  // Both start with "table" to ensure consistent server/client rendering
  const viewMode = externalViewMode ?? internalViewMode;
  
  const handleViewChange = (mode: TaskViewMode) => {
    if (externalOnViewChange) {
      externalOnViewChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const handleQuickCreate = async () => {
    if (!newTitle.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createSubtask(parentTaskId, {
        title: newTitle.trim(),
        priority: newPriority,
        status: "NOT_STARTED",
      });

      if (!result.success) {
        setCreateError(result.error || "Failed to create subtask");
      } else {
        setNewTitle("");
        setNewPriority("MEDIUM");
        router.refresh();
      }
    } catch (error) {
      setCreateError("An unexpected error occurred while creating the subtask");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleComplete = async (task: Subtask) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      await updateTask(task.id, {
        status: nextStatus as any,
      });
      router.refresh();
    } catch {
      // errors handled server-side
    }
  };

  const hasSubtasks = subtasks.length > 0;

  return (
    <div className="space-y-4 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl sm:text-xl font-bold text-neutral-900 dark:text-neutral-100">
          Subtasks
        </h2>
        {hasSubtasks && mounted && (
          <div className="hidden sm:block">
            <TaskViewToggle currentView={viewMode} onViewChange={handleViewChange} />
          </div>
        )}
      </div>

      {canManage && (
        <div className="rounded-lg bg-neutral-50/60 dark:bg-neutral-900/40 p-3 sm:p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Add a quick subtask (e.g. 'Draft outline', 'Review implementation')"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={isCreating}
              />
              <select
                className="hidden sm:block rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                disabled={isCreating}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={handleQuickCreate}
                disabled={isCreating || !newTitle.trim()}
                className="flex-shrink-0"
              >
                {isCreating ? "Creating..." : "Add"}
              </Button>
            </div>
            {createError && (
              <p className="text-xs text-error-600 dark:text-error-400">{createError}</p>
            )}
          </div>
        </div>
      )}

      {!hasSubtasks && !canManage && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No subtasks for this task yet.
        </p>
      )}

      {hasSubtasks && viewMode === "card" && (
        <div className="space-y-3 sm:divide-y sm:divide-neutral-200 sm:dark:divide-neutral-800 sm:space-y-0 rounded-lg border-2 sm:border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm sm:shadow-none">
          {subtasks.map((task) => (
            <div key={task.id} className="py-4 sm:py-4 px-4 sm:px-4 sm:first:pt-4 sm:last:pb-4">
              <div className="flex items-start gap-3 sm:gap-3">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(task)}
                    className={cn(
                      "mt-1 sm:mt-1 w-7 h-7 sm:w-4 sm:h-4 rounded-md sm:rounded border-2 sm:border flex items-center justify-center text-base sm:text-[10px] flex-shrink-0 transition-all active:scale-95",
                      task.status === "COMPLETED"
                        ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                        : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent hover:border-primary-400 dark:hover:border-primary-500"
                    )}
                    aria-label={
                      task.status === "COMPLETED" ? "Mark subtask as in progress" : "Mark subtask as completed"
                    }
                  >
                    ✓
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2 mb-2 sm:mb-1">
                    <Link
                      href={`/dashboard/tasks/${task.id}`}
                      className={cn(
                        "font-semibold text-base sm:text-sm text-neutral-900 dark:text-neutral-100 break-words leading-snug hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer",
                        task.status === "COMPLETED" && "line-through opacity-60"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.title}
                    </Link>
                    <Badge className={cn(getStatusColor(task.status), "text-xs sm:text-[10px] px-2.5 py-1 sm:px-2 sm:py-0.5 flex-shrink-0 font-medium")}>
                      {task.status.replace("_", " ")}
                    </Badge>
                    {task.priority && (
                      <Badge className={cn(getPriorityColor(task.priority), "text-xs sm:text-[10px] px-2.5 py-1 sm:px-2 sm:py-0.5 flex-shrink-0 font-medium")}>
                        {task.priority}
                      </Badge>
                    )}
                  </div>
                  {(task.assignedTo || task.dueDate) && (
                    <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 sm:gap-y-1 text-sm sm:text-[11px] text-neutral-600 dark:text-neutral-400">
                      {task.assignedTo && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {formatUserName(task.assignedTo)}
                          </span>
                        </div>
                      )}
                      {task.dueDate && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {formatDate(task.dueDate)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasSubtasks && viewMode === "table" && (
        <>
          {/* Mobile: Card view */}
          <div className="sm:hidden space-y-3">
            {subtasks.map((task) => (
              <div key={task.id} className="py-4 px-4 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
                <div className="flex items-start gap-3">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(task)}
                      className={cn(
                        "mt-1 w-7 h-7 rounded-md border-2 flex items-center justify-center text-base flex-shrink-0 transition-all active:scale-95",
                        task.status === "COMPLETED"
                          ? "bg-primary-600 border-primary-600 text-white shadow-sm"
                          : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent hover:border-primary-400 dark:hover:border-primary-500"
                      )}
                      aria-label={
                        task.status === "COMPLETED" ? "Mark subtask as in progress" : "Mark subtask as completed"
                      }
                    >
                      ✓
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Link
                        href={`/dashboard/tasks/${task.id}`}
                        className={cn(
                          "font-semibold text-base text-neutral-900 dark:text-neutral-100 break-words leading-snug hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer",
                          task.status === "COMPLETED" && "line-through opacity-60"
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.title}
                      </Link>
                      <Badge className={cn(getStatusColor(task.status), "text-xs px-2.5 py-1 flex-shrink-0 font-medium")}>
                        {task.status.replace("_", " ")}
                      </Badge>
                      <Badge className={cn(getPriorityColor(task.priority), "text-xs px-2.5 py-1 flex-shrink-0 font-medium")}>
                        {task.priority ?? "MEDIUM"}
                      </Badge>
                    </div>
                    {(task.assignedTo || task.dueDate) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {task.assignedTo && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">
                              {formatUserName(task.assignedTo)}
                            </span>
                          </div>
                        )}
                        {task.dueDate && (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">
                              {formatDate(task.dueDate)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: Table view */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border-2 sm:border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm sm:shadow-none">
            <table className="w-full text-base sm:text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/60">
              <tr>
                {canManage && (
                  <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 w-10 sm:w-8">
                    Done
                  </th>
                )}
                <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Title
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Status
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Priority
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden md:table-cell">
                  Assigned To
                </th>
                <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden lg:table-cell">
                  Due
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {subtasks.map((task) => (
                <tr key={task.id} className="bg-white dark:bg-neutral-900">
                  {canManage && (
                    <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(task)}
                        className={cn(
                          "w-6 h-6 sm:w-4 sm:h-4 rounded border-2 sm:border flex items-center justify-center text-sm sm:text-[10px]",
                          task.status === "COMPLETED"
                            ? "bg-primary-600 border-primary-600 text-white"
                            : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent"
                        )}
                        aria-label={
                          task.status === "COMPLETED"
                            ? "Mark subtask as in progress"
                            : "Mark subtask as completed"
                        }
                      >
                        ✓
                      </button>
                    </td>
                  )}
                  <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
                    <div className="max-w-xs">
                      <Link
                        href={`/dashboard/tasks/${task.id}`}
                        className="font-semibold text-base sm:text-sm text-neutral-900 dark:text-neutral-100 break-words hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.title}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
                    <Badge className={cn(getStatusColor(task.status), "text-xs sm:text-[11px] px-2.5 py-1 sm:px-2 sm:py-0.5 font-medium")}>
                      {task.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
                    <Badge className={cn(getPriorityColor(task.priority), "text-xs sm:text-[11px] px-2.5 py-1 sm:px-2 sm:py-0.5 font-medium")}>
                      {task.priority ?? "MEDIUM"}
                    </Badge>
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle hidden md:table-cell">
                    {task.assignedTo ? (
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        {formatUserName(task.assignedTo)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle hidden lg:table-cell">
                    {task.dueDate ? (
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        {formatDate(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
};

