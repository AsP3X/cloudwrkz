import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TaskViewToggle, type TaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { formatDateTime } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { cn } from "@/lib/utils/cn";
import type { Todo } from "@/lib/types";
import { ROUTES } from "@/lib/constants/routes";

// Human: React UI for `SubtasksSection` in tasks and todo lists: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tasks; BULK filters forms; EXPORTS SubtasksSection; REACT component; READS props hooks; MAY CALL api client.
function getStatusColor(status: string): string {
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
}

function getPriorityColor(priority?: string): string {
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
}

export interface SubtasksSectionProps {
  parentTaskId: string;
  subtasks: Todo[];
  /** Can edit/delete/toggle subtasks */
  canManage: boolean;
  /** Can add new subtasks (defaults to canManage). Set true when user can view parent so they can add subtasks. */
  canAddSubtasks?: boolean;
  viewMode?: TaskViewMode;
  onViewChange?: (mode: TaskViewMode) => void;
  onRefetch: () => void;
}

export function SubtasksSection({
  parentTaskId,
  subtasks,
  canManage,
  canAddSubtasks,
  viewMode: externalViewMode,
  onViewChange: externalOnViewChange,
  onRefetch,
}: SubtasksSectionProps) {
  const canAdd = canAddSubtasks ?? canManage;
  const [mounted, setMounted] = useState(false);
  const [internalViewMode, setInternalViewMode] = useState<TaskViewMode>("table");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const viewMode = externalViewMode ?? internalViewMode;
  const handleViewChange = (mode: TaskViewMode) => {
    if (externalOnViewChange) externalOnViewChange(mode);
    else setInternalViewMode(mode);
  };

  const handleQuickCreate = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await api.post<{ id: string }>("/todos", {
        title: newTitle.trim(),
        priority: "MEDIUM",
        status: "NOT_STARTED",
        parent_todo_id: parentTaskId,
      });
      setNewTitle("");
      onRefetch();
    } catch {
      setCreateError("Failed to create subtask");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleComplete = async (task: Todo) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      await api.patch(`/todos/${task.id}`, { status: nextStatus });
      onRefetch();
    } catch {
      // ignore
    }
  };

  const activeSubtasks = subtasks.filter((t) => t.status !== "COMPLETED");
  const completedSubtasks = subtasks.filter((t) => t.status === "COMPLETED");
  const hasSubtasks = subtasks.length > 0;
  const subtodosCount = (task: Todo) => (task.subtodos?.length ?? 0);

  const renderSubtaskRow = (task: Todo) => (
    <tr key={task.id} className="bg-white dark:bg-neutral-900">
      {canManage && (
        <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle w-10 sm:w-8">
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className={cn(
              "w-6 h-6 sm:w-4 sm:h-4 rounded border-2 sm:border flex items-center justify-center text-sm sm:text-[10px]",
              task.status === "COMPLETED"
                ? "bg-primary-600 border-primary-600 text-white"
                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent hover:border-primary-400 dark:hover:border-primary-500"
            )}
            aria-label={task.status === "COMPLETED" ? "Mark as in progress" : "Mark as completed"}
          >
            ✓
          </button>
        </td>
      )}
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
        <div className="max-w-xs">
          <Link
            to={`${ROUTES.DASHBOARD}/todos/${task.id}`}
            className={cn(
              "font-semibold text-base sm:text-sm text-neutral-900 dark:text-neutral-100 break-words hover:text-primary-600 dark:hover:text-primary-400 transition-colors",
              task.status === "COMPLETED" && "line-through opacity-60"
            )}
          >
            {task.title}
          </Link>
        </div>
      </td>
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
        <Badge className={cn(getStatusColor(task.status), "text-xs sm:text-[11px] px-2.5 py-1 font-medium")}>
          {task.status.replace(/_/g, " ")}
        </Badge>
      </td>
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle">
        <Badge className={cn(getPriorityColor(task.priority), "text-xs sm:text-[11px] px-2.5 py-1 font-medium")}>
          {task.priority ?? "MEDIUM"}
        </Badge>
      </td>
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle hidden xl:table-cell">
        {subtodosCount(task) > 0 ? (
          <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 font-medium">
            {subtodosCount(task)} {subtodosCount(task) === 1 ? "subtask" : "subtasks"}
          </Badge>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
        )}
      </td>
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle hidden md:table-cell">
        {task.assigned_to ? (
          <span className="text-sm text-neutral-800 dark:text-neutral-200">{formatUserName(task.assigned_to)}</span>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
        )}
      </td>
      <td className="px-3 sm:px-4 py-3 sm:py-2 align-middle hidden lg:table-cell">
        {task.due_date ? (
          <span className="text-sm text-neutral-800 dark:text-neutral-200">{formatDateTime(task.due_date)}</span>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
        )}
      </td>
    </tr>
  );

  const renderSubtaskCard = (task: Todo) => (
    <div key={task.id} className="p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {canManage && (
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className={cn(
              "mt-1 w-7 h-7 sm:w-4 sm:h-4 rounded-md sm:rounded border-2 flex items-center justify-center flex-shrink-0 transition-all active:scale-95",
              task.status === "COMPLETED"
                ? "bg-primary-600 border-primary-600 text-white"
                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent hover:border-primary-400 dark:hover:border-primary-500"
            )}
            aria-label={task.status === "COMPLETED" ? "Mark as in progress" : "Mark as completed"}
          >
            ✓
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1 sm:mb-2">
            <Link
              to={`${ROUTES.DASHBOARD}/todos/${task.id}`}
              className={cn(
                "font-semibold text-base sm:text-sm text-neutral-900 dark:text-neutral-100 break-words leading-snug hover:text-primary-600 dark:hover:text-primary-400",
                task.status === "COMPLETED" && "line-through opacity-60"
              )}
            >
              {task.title}
            </Link>
            <Badge className={cn(getStatusColor(task.status), "text-xs sm:text-[10px] px-2.5 py-1 font-medium")}>
              {task.status.replace(/_/g, " ")}
            </Badge>
            <Badge className={cn(getPriorityColor(task.priority), "text-xs sm:text-[10px] px-2.5 py-1 font-medium")}>
              {task.priority ?? "MEDIUM"}
            </Badge>
            {subtodosCount(task) > 0 && (
              <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 font-medium">
                {subtodosCount(task)} {subtodosCount(task) === 1 ? "subtask" : "subtasks"}
              </Badge>
            )}
          </div>
          {(task.assigned_to || task.due_date) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {task.assigned_to && (
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {formatUserName(task.assigned_to)}
                </span>
              )}
              {task.due_date && (
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {formatDateTime(task.due_date)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSubtaskMobileCard = (task: Todo) => (
    <div
      key={task.id}
      className="py-4 px-4 rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {canManage && (
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className={cn(
              "mt-1 w-7 h-7 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all active:scale-95",
              task.status === "COMPLETED"
                ? "bg-primary-600 border-primary-600 text-white"
                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent hover:border-primary-400"
            )}
            aria-label={task.status === "COMPLETED" ? "Mark as in progress" : "Mark as completed"}
          >
            ✓
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Link
              to={`${ROUTES.DASHBOARD}/todos/${task.id}`}
              className={cn(
                "font-semibold text-base text-neutral-900 dark:text-neutral-100 break-words leading-snug hover:text-primary-600 dark:hover:text-primary-400",
                task.status === "COMPLETED" && "line-through opacity-60"
              )}
            >
              {task.title}
            </Link>
            <Badge className={cn(getStatusColor(task.status), "text-xs px-2.5 py-1 font-medium")}>
              {task.status.replace(/_/g, " ")}
            </Badge>
            <Badge className={cn(getPriorityColor(task.priority), "text-xs px-2.5 py-1 font-medium")}>
              {task.priority ?? "MEDIUM"}
            </Badge>
            {subtodosCount(task) > 0 && (
              <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 font-medium">
                {subtodosCount(task)} {subtodosCount(task) === 1 ? "subtask" : "subtasks"}
              </Badge>
            )}
          </div>
          {(task.assigned_to || task.due_date) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {task.assigned_to && (
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {formatUserName(task.assigned_to)}
                </span>
              )}
              {task.due_date && (
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {formatDateTime(task.due_date)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: title + count badge + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
            Subtasks
          </h2>
          {hasSubtasks && (
            <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm px-2.5 py-1">
              {subtasks.length} {subtasks.length === 1 ? "subtask" : "subtasks"}
            </Badge>
          )}
        </div>
        {hasSubtasks && mounted && (
          <div className="hidden sm:block">
            <TaskViewToggle currentView={viewMode} onViewChange={handleViewChange} showKanban={false} />
          </div>
        )}
      </div>

      {/* Add a subtask - single row inside the section (match Next.js card) */}
      <div className="rounded-lg bg-neutral-50/60 dark:bg-neutral-900/40 p-3 sm:p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder={
                canAdd
                  ? "Add a quick subtask (e.g. 'Draft outline', 'Review implementation')"
                  : "You need edit permission to add subtasks"
              }
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdd) {
                  e.preventDefault();
                  handleQuickCreate();
                }
              }}
              disabled={isCreating || !canAdd}
              aria-label="New subtask title"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleQuickCreate}
              disabled={isCreating || !newTitle.trim() || !canAdd}
              className="flex-shrink-0 w-20"
            >
              {isCreating ? "Creating…" : "Add"}
            </Button>
          </div>
          {createError && (
            <p className="text-xs text-error-600 dark:text-error-400">{createError}</p>
          )}
          {!canAdd && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Only users with edit access to this task can add subtasks.
            </p>
          )}
        </div>
      </div>

      {!hasSubtasks && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No subtasks for this task yet.
        </p>
      )}

      {/* Active subtasks list */}
      {activeSubtasks.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {activeSubtasks.map(renderSubtaskCard)}
            </div>
          )}
          {viewMode === "table" && (
            <>
              {/* Mobile: card view */}
              <div className="sm:hidden space-y-3 p-4">
                {activeSubtasks.map(renderSubtaskMobileCard)}
              </div>
              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-base sm:text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-700">
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
                      <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden xl:table-cell">
                        Subtasks
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
                    {activeSubtasks.map(renderSubtaskRow)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Completed subtasks */}
      {completedSubtasks.length > 0 && (
        <div className="mt-6 bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Completed Subtasks
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {completedSubtasks.length} {completedSubtasks.length === 1 ? "subtask" : "subtasks"} completed
            </p>
          </div>
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {completedSubtasks.map(renderSubtaskCard)}
            </div>
          )}
          {viewMode === "table" && (
            <>
              <div className="sm:hidden space-y-3 p-4">
                {completedSubtasks.map(renderSubtaskMobileCard)}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-base sm:text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
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
                      <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden xl:table-cell">
                        Subtasks
                      </th>
                      <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden md:table-cell">
                        Assigned To
                      </th>
                      <th className="px-3 sm:px-4 py-3 sm:py-2 text-left text-sm sm:text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden lg:table-cell">
                        Due
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                    {completedSubtasks.map(renderSubtaskRow)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
