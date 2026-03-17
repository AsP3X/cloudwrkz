"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDateInTimezone } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { TaskViewMode } from "../TaskViewToggle";
import { cn } from "@/lib/utils/cn";
import { bulkArchiveTodos, bulkDeleteTodos, bulkUpdateTodos, updateTodo } from "@/server/actions/todos";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { TodoBulkActionsToolbar } from "../TodoBulkActionsToolbar";
import { TodoBulkDeleteDialog } from "../TodoBulkDeleteDialog";
import { Checkbox } from "@/components/ui/Checkbox";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";

type StandaloneTask = {
  id: string;
  taskNumber?: string | null;
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

interface StandaloneTaskListProps {
  tasks: StandaloneTask[];
  viewMode: TaskViewMode;
  canManage: boolean;
  /** When true, show selection checkboxes and bulk actions. Controlled by the header "Select" menu option. */
  showBulkSelect?: boolean;
  userTimezone?: string;
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

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "HIGH":
      return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
    case "MEDIUM":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
};

const getPriorityBorderColor = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "border-red-200 dark:border-red-600";
    case "HIGH":
      return "border-orange-200 dark:border-orange-600";
    case "MEDIUM":
      return "border-yellow-200 dark:border-yellow-600";
    default:
      return "border-neutral-200 dark:border-neutral-800";
  }
};

export const StandaloneTaskList = ({ tasks, viewMode, canManage, showBulkSelect = false, userTimezone = "UTC" }: StandaloneTaskListProps) => {
  const router = useRouter();
  const showSelectionUi = Boolean(canManage && showBulkSelect);

  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedTodos, setSelectedTodos] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!showBulkSelect) setSelectedTodos(new Set());
  }, [showBulkSelect]);
  const [isBulkProcessing, setIsBulkProcessing] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; task: StandaloneTask } | null>(null);
  const selectAllActiveRef = React.useRef<HTMLInputElement>(null);
  const selectAllCompletedRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleToggleComplete = async (task: StandaloneTask) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      await updateTodo(task.id, {
        status: nextStatus as any,
      });
      router.refresh();
    } catch (error) {
      // Errors are logged server-side; we keep UI simple here
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStatus !== targetStatus) {
      setDragOverStatus(targetStatus);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetStatus: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    if (!draggedTaskId) return;

    const task = tasks.find((t) => t.id === draggedTaskId);
    if (!task || task.status === targetStatus) {
      setDraggedTaskId(null);
      return;
    }

    setIsUpdating(true);
    try {
      await updateTodo(draggedTaskId, {
        status: targetStatus as any,
      });
      router.refresh();
    } catch (error) {
      // Errors are logged server-side
    } finally {
      setIsUpdating(false);
      setDraggedTaskId(null);
    }
  };

  // Separate active and completed tasks
  const activeTasks = tasks.filter((task) => task.status !== "COMPLETED");
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");

  const activeSelectedCount = React.useMemo(() => {
    if (!mounted) return 0;
    return activeTasks.reduce((count, t) => (selectedTodos.has(t.id) ? count + 1 : count), 0);
  }, [activeTasks, mounted, selectedTodos]);

  const completedSelectedCount = React.useMemo(() => {
    if (!mounted) return 0;
    return completedTasks.reduce((count, t) => (selectedTodos.has(t.id) ? count + 1 : count), 0);
  }, [completedTasks, mounted, selectedTodos]);

  const allSelectedActive = activeTasks.length > 0 && activeSelectedCount === activeTasks.length;
  const someSelectedActive = activeSelectedCount > 0 && activeSelectedCount < activeTasks.length;
  const allSelectedCompleted = completedTasks.length > 0 && completedSelectedCount === completedTasks.length;
  const someSelectedCompleted = completedSelectedCount > 0 && completedSelectedCount < completedTasks.length;

  const handleSelectTodo = (todoId: string, checked: boolean) => {
    setSelectedTodos((prev) => {
      const next = new Set(prev);
      if (checked) next.add(todoId);
      else next.delete(todoId);
      return next;
    });
  };

  const handleSelectAllActive = (checked: boolean) => {
    setSelectedTodos((prev) => {
      const next = new Set(prev);
      if (checked) {
        activeTasks.forEach((t) => next.add(t.id));
      } else {
        activeTasks.forEach((t) => next.delete(t.id));
      }
      return next;
    });
  };

  const handleSelectAllCompleted = (checked: boolean) => {
    setSelectedTodos((prev) => {
      const next = new Set(prev);
      if (checked) {
        completedTasks.forEach((t) => next.add(t.id));
      } else {
        completedTasks.forEach((t) => next.delete(t.id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedTodos(new Set());
    setBulkError(null);
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedTodos.size === 0 || isBulkProcessing) return;

    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      const result = await bulkUpdateTodos(Array.from(selectedTodos), {
        status: status as any,
      });
      if (result.success) {
        setSelectedTodos(new Set());
        router.refresh();
      } else {
        setBulkError(result.error || "Failed to update todos");
      }
    } catch (err) {
      setBulkError("An unexpected error occurred");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkPriorityChange = async (priority: string) => {
    if (selectedTodos.size === 0 || isBulkProcessing) return;

    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      const result = await bulkUpdateTodos(Array.from(selectedTodos), {
        priority: priority as any,
      });
      if (result.success) {
        setSelectedTodos(new Set());
        router.refresh();
      } else {
        setBulkError(result.error || "Failed to update todos");
      }
    } catch (err) {
      setBulkError("An unexpected error occurred");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTodos.size === 0 || isBulkProcessing) return;
    setShowBulkDeleteDialog(true);
  };

  const handleBulkArchive = async () => {
    if (selectedTodos.size === 0 || isBulkProcessing) return;

    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      const result = await bulkArchiveTodos(Array.from(selectedTodos));
      if (result.success) {
        setSelectedTodos(new Set());
        router.refresh();
      } else {
        setBulkError(result.error || "Failed to archive todos");
      }
    } catch (err) {
      setBulkError("An unexpected error occurred");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedTodos.size === 0) return;

    setIsBulkProcessing(true);
    setBulkError(null);
    try {
      const result = await bulkDeleteTodos(Array.from(selectedTodos));
      if (result.success) {
        setSelectedTodos(new Set());
        setShowBulkDeleteDialog(false);
        router.refresh();
      } else {
        setBulkError(result.error || "Failed to delete todos");
        setShowBulkDeleteDialog(false);
      }
    } catch (err) {
      setBulkError("An unexpected error occurred");
      setShowBulkDeleteDialog(false);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleSingleArchive = React.useCallback(
    async (taskId: string) => {
      setContextMenu(null);
      setIsBulkProcessing(true);
      setBulkError(null);
      try {
        const result = await bulkArchiveTodos([taskId]);
        if (result.success) {
          router.refresh();
        } else {
          setBulkError(result.error || "Failed to archive todo");
        }
      } catch {
        setBulkError("An unexpected error occurred");
      } finally {
        setIsBulkProcessing(false);
      }
    },
    [router]
  );

  const handleOpenDeleteForTask = React.useCallback((taskId: string) => {
    setContextMenu(null);
    setSelectedTodos(new Set([taskId]));
    setShowBulkDeleteDialog(true);
  }, []);

  const getTaskContextMenuItems = React.useCallback(
    (task: StandaloneTask): OverviewContextMenuItem[] => {
      const items: OverviewContextMenuItem[] = [
        {
          id: "open",
          label: "Open",
          onClick: () => {
            setContextMenu(null);
            router.push(`/dashboard/todos/${task.id}`);
          },
        },
        {
          id: "toggle",
          label: task.status === "COMPLETED" ? "Mark in progress" : "Mark complete",
          onClick: () => {
            setContextMenu(null);
            handleToggleComplete(task);
          },
          disabled: isUpdating,
        },
      ];
      if (canManage) {
        items.push(
          {
            id: "edit",
            label: "Edit",
            onClick: () => {
              setContextMenu(null);
              router.push(`/dashboard/todos/${task.id}/edit`);
            },
            separatorAbove: true,
          },
          {
            id: "archive",
            label: "Archive",
            onClick: () => handleSingleArchive(task.id),
            disabled: isBulkProcessing,
          },
          {
            id: "delete",
            label: "Delete",
            onClick: () => handleOpenDeleteForTask(task.id),
            disabled: isBulkProcessing,
            destructive: true,
          }
        );
      }
      return items;
    },
    [canManage, isUpdating, isBulkProcessing, router, handleToggleComplete, handleSingleArchive, handleOpenDeleteForTask]
  );

  const STATUS_COLUMNS: Array<{ value: string; label: string; hint?: string }> = [
    { value: "NOT_STARTED", label: "Not Started" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "BLOCKED", label: "Blocked" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

  const tasksByStatus = STATUS_COLUMNS.reduce<Record<string, StandaloneTask[]>>((acc, column) => {
    acc[column.value] = tasks.filter((task) => task.status === column.value);
    return acc;
  }, {});

  const renderTaskCard = (task: StandaloneTask) => {
    // Runtime-safe access to parent todo information from the server object
    const parentTodo = (task as any).parentTodo ?? task.parentTask;
    const parentTodoId: string | undefined =
      (task as any).parentTodoId ?? (parentTodo ? parentTodo.id : undefined);
    const isSubTodo = !!parentTodoId;
    const isSelected = mounted && selectedTodos.has(task.id);

    return (
    <div
      key={task.id}
      className="p-3 sm:p-4"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, task });
      }}
    >
      <div className="flex items-center gap-3">
        {showSelectionUi && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onChange={(e) => handleSelectTodo(task.id, e.target.checked)}
              aria-label="Select todo"
              suppressHydrationWarning
              className="flex-shrink-0"
            />
          </div>
        )}
        {canManage && (
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
              task.status === "COMPLETED"
                ? "bg-primary-600 border-primary-600 text-white"
                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent"
            )}
            aria-label={
              task.status === "COMPLETED" ? "Mark task as in progress" : "Mark task as completed"
            }
          >
            ✓
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Link
              href={`/dashboard/todos/${task.id}`}
              className="font-medium text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              {task.title}
            </Link>
            <Badge
              className={cn(
                "text-[10px] px-2 py-0.5",
                isSubTodo
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              )}
            >
              {isSubTodo ? "Sub-todo" : "Root todo"}
            </Badge>
            <Badge className={cn(getStatusColor(task.status), "text-[10px] px-2 py-0.5")}>
              {task.status.replace("_", " ")}
            </Badge>
            {viewMode !== "kanban" && (
              <Badge className={cn(getPriorityColor(task.priority), "text-[10px] px-2 py-0.5")}>
                {task.priority}
              </Badge>
            )}
            {task._count && task._count.subtasks > 0 && (
              <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5">
                {task._count.subtasks} {task._count.subtasks === 1 ? "subtask" : "subtasks"}
              </Badge>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-1.5">
              {task.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {parentTodo && (
              <span>
                Subtask of{" "}
              <Link
                  href={`/dashboard/todos/${parentTodo.id}`}
                  className="text-neutral-800 dark:text-neutral-200 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {parentTodo.title}
                </Link>
              </span>
            )}
            {task.ticket && (
              <Link
                href={`/dashboard/tickets/${task.ticket.id}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {task.ticket.ticketNumber}
              </Link>
            )}
            {task.assignedTo && (
              <span>
                Assigned to{" "}
                <span className="text-neutral-800 dark:text-neutral-200">
                  {formatUserName(task.assignedTo)}
                </span>
              </span>
            )}
            {task.dueDate && (
              <span>
                Due{" "}
                <span className="text-neutral-800 dark:text-neutral-200">
                  {formatDateInTimezone(task.dueDate, userTimezone)}
                </span>
              </span>
            )}
            {typeof task.estimatedHours === "number" && (
              <span>Est. {task.estimatedHours.toFixed(1)}h</span>
            )}
            {typeof task.actualHours === "number" && (
              <span>Actual {task.actualHours.toFixed(1)}h</span>
            )}
            {task._count && task._count.subtasks > 0 && (
              <span>
                {task._count.subtasks} {task._count.subtasks === 1 ? "subtask" : "subtasks"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  };

  const renderTaskRow = (task: StandaloneTask) => (
    <tr
      key={task.id}
      className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, task });
      }}
    >
      {showSelectionUi && (
        <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center">
            <Checkbox
              checked={mounted && selectedTodos.has(task.id)}
              onChange={(e) => handleSelectTodo(task.id, e.target.checked)}
              aria-label="Select todo"
              suppressHydrationWarning
            />
          </div>
        </td>
      )}
      {canManage && (
        <td className="px-6 py-4 whitespace-nowrap w-12">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => handleToggleComplete(task)}
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                task.status === "COMPLETED"
                  ? "bg-primary-600 border-primary-600 text-white"
                  : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-transparent"
              )}
              aria-label={
                task.status === "COMPLETED"
                  ? "Mark task as in progress"
                  : "Mark task as completed"
              }
            >
              ✓
            </button>
          </div>
        </td>
      )}
      <td className="px-6 py-4">
        <Link
          href={`/dashboard/todos/${task.id}`}
          className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <div className="max-w-md">
            <div className="truncate">
              {task.taskNumber && (
                <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 mr-2">
                  {task.taskNumber}
                </span>
              )}
              {task.title}
            </div>
            {task.description && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                {task.description}
              </div>
            )}
          </div>
        </Link>
      </td>
      <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
        {task.ticket ? (
          <Link
            href={`/dashboard/tickets/${task.ticket.id}`}
            className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            {task.ticket.ticketNumber}
          </Link>
        ) : (task as any).parentTodo || task.parentTask ? (
          (() => {
            const parentTodo = (task as any).parentTodo ?? task.parentTask;
            return (
          <Link
              href={`/dashboard/todos/${parentTodo.id}`}
            className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
          >
                Subtask of {parentTodo.title}
          </Link>
            );
          })()
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap hidden xl:table-cell">
        {task._count && task._count.subtasks > 0 ? (
          <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            {task._count.subtasks} {task._count.subtasks === 1 ? "subtask" : "subtasks"}
          </Badge>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge className={getStatusColor(task.status)}>{task.status.replace("_", " ")}</Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
        {task.assignedTo ? (
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            {formatUserName(task.assignedTo)}
          </div>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-400">Unassigned</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
        {task.dueDate ? (
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatDateInTimezone(task.dueDate, userTimezone)}
          </div>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
        {typeof task.estimatedHours === "number" || typeof task.actualHours === "number" ? (
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            {typeof task.estimatedHours === "number" && (
              <div>Est. {task.estimatedHours.toFixed(1)}h</div>
            )}
            {typeof task.actualHours === "number" && (
              <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                Act. {task.actualHours.toFixed(1)}h
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
        )}
      </td>
    </tr>
  );

  return (
    <>
      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/60 dark:border-neutral-800/60 overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 text-xs text-neutral-600 dark:text-neutral-400 border-b border-neutral-200/70 dark:border-neutral-800/70">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 text-xs">
                ⌘
              </span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">
                Kanban board
              </span>
              <span className="hidden md:inline text-[11px] text-neutral-500 dark:text-neutral-400">
                Drag tasks between columns to update their status.
              </span>
            </div>
            <div className="flex items-center gap-3">
              {showSelectionUi && selectedTodos.size > 0 && (
                <TodoBulkActionsToolbar
                  variant="inline"
                  selectedCount={selectedTodos.size}
                  onBulkStatusChange={handleBulkStatusChange}
                  onBulkPriorityChange={handleBulkPriorityChange}
                  onBulkArchive={handleBulkArchive}
                  onBulkDelete={handleBulkDelete}
                  onClearSelection={handleClearSelection}
                />
              )}
              {isUpdating && (
                <span className="italic text-neutral-500 dark:text-neutral-500">
                  Updating…
                </span>
              )}
            </div>
          </div>
          {bulkError && showSelectionUi && selectedTodos.size > 0 && (
            <div className="px-4 md:px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">
                  {bulkError}
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-4 md:gap-6 px-3 md:px-4 pb-4 pt-3 min-w-max">
            {STATUS_COLUMNS.map((column) => {
              const columnTasks = tasksByStatus[column.value] || [];
              return (
                <div
                  key={column.value}
                  className="w-64 md:w-72 bg-neutral-50/80 dark:bg-neutral-950/40 rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 shadow-sm flex-shrink-0 flex flex-col"
                  onDragOver={(e) => canManage && handleDragOver(e, column.value)}
                  onDrop={(e) => canManage && handleDrop(e, column.value)}
                  onDragLeave={() => {
                    if (dragOverStatus === column.value) {
                      setDragOverStatus(null);
                    }
                  }}
                >
                  <div className="px-3 py-3 border-b border-neutral-200/70 dark:border-neutral-800/70 flex items-center justify-between gap-2 bg-white/60 dark:bg-neutral-950/40 rounded-t-2xl">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                        {column.label}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                        {columnTasks.length} {columnTasks.length === 1 ? "task" : "tasks"}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                    {columnTasks.length === 0 && (
                      <div
                        className={cn(
                          "text-[11px] text-neutral-400 dark:text-neutral-500 px-2 py-6 text-center border-2 border-dashed border-neutral-200/80 dark:border-neutral-800/80 rounded-lg bg-white/40 dark:bg-neutral-950/20 transition-colors",
                          dragOverStatus === column.value &&
                            "border-primary-300 dark:border-primary-500/80 bg-primary-50/40 dark:bg-primary-950/20 text-primary-700 dark:text-primary-200"
                        )}
                      >
                        No tasks in this column yet
                      </div>
                    )}
                    {columnTasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "rounded-xl border bg-white dark:bg-neutral-900/95 shadow-soft-lg hover:shadow-md transition-shadow transition-colors",
                          getPriorityBorderColor(task.priority)
                        )}
                        draggable={canManage}
                        onDragStart={(e) => canManage && handleDragStart(e, task.id)}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setIsDialogOpen(true);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, task });
                        }}
                      >
                        {renderTaskCard(task)}
                      </div>
                    ))}
                    {canManage && dragOverStatus === column.value && columnTasks.length > 0 && (
                      <div className="h-10 rounded-lg border-2 border-dashed border-primary-300 dark:border-primary-600 bg-primary-50/40 dark:bg-primary-950/10 flex items-center justify-center text-[11px] text-primary-700 dark:text-primary-200">
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getTaskContextMenuItems(contextMenu.task) : []}
      />
      {/* Todo detail dialog (used from Kanban cards) */}
      {selectedTaskId && (
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setSelectedTaskId(null);
            }
          }}
          title="ToDo Details"
        >
          {(() => {
            const task = tasks.find((t) => t.id === selectedTaskId);
            if (!task) return null;

            const parentTodo = (task as any).parentTodo ?? task.parentTask;
            const subtodos = ((task as any).subtodos ?? []) as Array<{
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
              _count?: {
                subtodos: number;
              };
            }>;

            return (
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-neutral-50 break-words">
                        {task.title}
                      </h3>
                      {task.taskNumber && (
                        <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-neutral-600 dark:text-neutral-300">
                          {task.taskNumber}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    href={`/dashboard/todos/${task.id}`}
                    className="shrink-0"
                  >
                    <>
                      <svg
                        className="w-4 h-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      <span>Open</span>
                    </>
                  </Button>
                </div>

                <div
                  className={cn(
                    "mt-2 grid gap-4 text-xs sm:text-sm",
                    subtodos.length ? "sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)]" : "grid-cols-1"
                  )}
                >
                  {/* Main details */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                      <Badge className={cn(getStatusColor(task.status), "text-[11px] px-2 py-0.5")}>
                        {task.status.replace("_", " ")}
                      </Badge>
                      <Badge className={cn(getPriorityColor(task.priority), "text-[11px] px-2 py-0.5")}>
                        {task.priority}
                      </Badge>
                      {parentTodo && (
                        <span>
                          Sub-todo of{" "}
                          <Link
                            href={`/dashboard/todos/${parentTodo.id}`}
                            className="text-neutral-900 dark:text-neutral-100 underline underline-offset-2"
                          >
                            {parentTodo.title}
                          </Link>
                        </span>
                      )}
                      {task.ticket && (
                        <Link
                          href={`/dashboard/tickets/${task.ticket.id}`}
                          className="text-primary-600 dark:text-primary-400 font-medium"
                        >
                          {task.ticket.ticketNumber}
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-neutral-500 dark:text-neutral-400">Assigned to</p>
                        <p className="text-neutral-900 dark:text-neutral-100">
                          {task.assignedTo ? formatUserName(task.assignedTo) : "Unassigned"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-neutral-500 dark:text-neutral-400">Due date</p>
                        <p className="text-neutral-900 dark:text-neutral-100">
                          {task.dueDate ? formatDateInTimezone(task.dueDate, userTimezone) : "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-neutral-500 dark:text-neutral-400">Estimated hours</p>
                        <p className="text-neutral-900 dark:text-neutral-100">
                          {typeof task.estimatedHours === "number" ? `${task.estimatedHours.toFixed(1)}h` : "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-neutral-500 dark:text-neutral-400">Actual hours</p>
                        <p className="text-neutral-900 dark:text-neutral-100">
                          {typeof task.actualHours === "number" ? `${task.actualHours.toFixed(1)}h` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sub-todos column (rendered in separate side panel; keep hidden here) */}
                  {false && subtodos.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          Sub-todos
                        </h4>
                        <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[11px] px-2 py-0.5">
                          {subtodos.length} {subtodos.length === 1 ? "item" : "items"}
                        </Badge>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {subtodos.map((sub) => (
                          <Link
                            key={sub.id}
                            href={`/dashboard/todos/${sub.id}`}
                            className="block rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 px-3 py-2 hover:border-primary-300 dark:hover:border-primary-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2">
                                  {sub.title}
                                </p>
                                {sub.dueDate && (
                                  <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                                    Due {formatDateInTimezone(sub.dueDate, userTimezone)}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge className={cn(getStatusColor(sub.status), "text-[10px] px-2 py-0.5")}>
                                  {sub.status.replace("_", " ")}
                                </Badge>
                                {sub.priority && (
                                  <Badge className={cn(getPriorityColor(sub.priority), "text-[10px] px-2 py-0.5")}>
                                    {sub.priority}
                                  </Badge>
                                )}
                          {sub._count && sub._count.subtodos > 0 && (
                            <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5">
                              {sub._count.subtodos} more
                            </Badge>
                          )}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Dialog>
      )}

      {/* Active Tasks */}
      {viewMode !== "kanban" && activeTasks.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {showSelectionUi && selectedTodos.size > 0 && completedTasks.length === 0 && (
            <>
              <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      Active Tasks
                    </h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {activeTasks.length} {activeTasks.length === 1 ? "task" : "tasks"}
                    </p>
                  </div>
                </div>
                <TodoBulkActionsToolbar
                  variant="inline"
                  selectedCount={selectedTodos.size}
                  onBulkStatusChange={handleBulkStatusChange}
                  onBulkPriorityChange={handleBulkPriorityChange}
                  onBulkArchive={handleBulkArchive}
                  onBulkDelete={handleBulkDelete}
                  onClearSelection={handleClearSelection}
                />
              </div>
              {bulkError && showSelectionUi && (
                <div className="px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">
                      {bulkError}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="border-b last:border-b-0 border-transparent"
                >
                  {renderTaskCard(task)}
                </div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
                    {showSelectionUi && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                        <div className="flex items-center">
                          <Checkbox
                            ref={selectAllActiveRef}
                            checked={allSelectedActive}
                            indeterminate={someSelectedActive}
                            onChange={(e) => handleSelectAllActive(e.target.checked)}
                            aria-label="Select all active todos"
                            suppressHydrationWarning
                          />
                        </div>
                      </th>
                    )}
                    {canManage && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                        Done
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                      Ticket
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden xl:table-cell">
                      Subtasks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                      Due
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                      Est / Actual
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {activeTasks.map(renderTaskRow)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Completed Tasks */}
      {viewMode !== "kanban" && completedTasks.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Completed Tasks
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {completedTasks.length} {completedTasks.length === 1 ? "task" : "tasks"} completed
                </p>
              </div>
            </div>
            {showSelectionUi && selectedTodos.size > 0 && (
              <TodoBulkActionsToolbar
                variant="inline"
                selectedCount={selectedTodos.size}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkPriorityChange={handleBulkPriorityChange}
                onBulkArchive={handleBulkArchive}
                onBulkDelete={handleBulkDelete}
                onClearSelection={handleClearSelection}
              />
            )}
          </div>
          {bulkError && showSelectionUi && selectedTodos.size > 0 && (
            <div className="px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">
                  {bulkError}
                </p>
              </div>
            </div>
          )}
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="border-b last:border-b-0 border-transparent"
                >
                  {renderTaskCard(task)}
                </div>
              ))}
            </div>
          )}

          {viewMode === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
                    {showSelectionUi && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                        <div className="flex items-center">
                          <Checkbox
                            ref={selectAllCompletedRef}
                            checked={allSelectedCompleted}
                            indeterminate={someSelectedCompleted}
                            onChange={(e) => handleSelectAllCompleted(e.target.checked)}
                            aria-label="Select all completed todos"
                            suppressHydrationWarning
                          />
                        </div>
                      </th>
                    )}
                    {canManage && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                        Done
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                      Ticket
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden xl:table-cell">
                      Subtasks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                      Due
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                      Est / Actual
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {completedTasks.map(renderTaskRow)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {showBulkDeleteDialog && (
        <TodoBulkDeleteDialog
          open={showBulkDeleteDialog}
          onOpenChange={setShowBulkDeleteDialog}
          onConfirm={handleBulkDeleteConfirm}
          selectedCount={selectedTodos.size}
        />
      )}
    </>
  );
};
