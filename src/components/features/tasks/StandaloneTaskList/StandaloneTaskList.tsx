"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDateInTimezone } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { TaskViewMode } from "../TaskViewToggle";
import { cn } from "@/lib/utils/cn";
import { updateTodo } from "@/server/actions/todos";
import { useRouter } from "next/navigation";

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

export const StandaloneTaskList = ({ tasks, viewMode, canManage, userTimezone = "UTC" }: StandaloneTaskListProps) => {
  const router = useRouter();
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

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

  const renderTaskCard = (task: StandaloneTask) => (
    <div key={task.id} className="p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {canManage && (
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className={cn(
              "mt-1 w-4 h-4 rounded border flex items-center justify-center text-[10px]",
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
            <Badge className={cn(getStatusColor(task.status), "text-[10px] px-2 py-0.5")}>
              {task.status.replace("_", " ")}
            </Badge>
            <Badge className={cn(getPriorityColor(task.priority), "text-[10px] px-2 py-0.5")}>
              {task.priority}
            </Badge>
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
            {task.parentTask && (
              <span>
                Subtask of{" "}
              <Link
                  href={`/dashboard/todos/${task.parentTask.id}`}
                  className="text-neutral-800 dark:text-neutral-200 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {task.parentTask.title}
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

  const renderTaskRow = (task: StandaloneTask) => (
    <tr key={task.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
      {canManage && (
        <td className="px-6 py-4 whitespace-nowrap w-12">
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
        ) : task.parentTask ? (
          <Link
            href={`/dashboard/todos/${task.parentTask.id}`}
            className="text-xs text-neutral-600 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400"
          >
            Subtask of {task.parentTask.title}
          </Link>
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
            {isUpdating && (
              <span className="italic text-neutral-500 dark:text-neutral-500">
                Updating…
              </span>
            )}
          </div>
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
                          "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/95 shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-500/70 hover:shadow-md transition-shadow transition-colors",
                          canManage && "cursor-move"
                        )}
                        draggable={canManage}
                        onDragStart={(e) => canManage && handleDragStart(e, task.id)}
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

      {/* Active Tasks */}
      {viewMode !== "kanban" && activeTasks.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {activeTasks.map(renderTaskCard)}
            </div>
          )}

          {viewMode === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
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
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Completed Tasks
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {completedTasks.length} {completedTasks.length === 1 ? "task" : "tasks"} completed
            </p>
          </div>
          {viewMode === "card" && (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {completedTasks.map(renderTaskCard)}
            </div>
          )}

          {viewMode === "table" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                  <tr>
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
    </>
  );
};
