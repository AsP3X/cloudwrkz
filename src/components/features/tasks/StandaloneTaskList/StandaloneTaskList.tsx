"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { TaskViewMode } from "../TaskViewToggle";
import { cn } from "@/lib/utils/cn";
import { updateTask } from "@/server/actions/tasks";
import { useRouter } from "next/navigation";

type StandaloneTask = {
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

interface StandaloneTaskListProps {
  tasks: StandaloneTask[];
  viewMode: TaskViewMode;
  canManage: boolean;
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

export const StandaloneTaskList = ({ tasks, viewMode, canManage }: StandaloneTaskListProps) => {
  const router = useRouter();

  const handleToggleComplete = async (task: StandaloneTask) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      await updateTask(task.id, {
        status: nextStatus as any,
      });
      router.refresh();
    } catch (error) {
      // Errors are logged server-side; we keep UI simple here
    }
  };

  return (
    <div className="space-y-4">

      {tasks.length > 0 && viewMode === "card" && (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {tasks.map((task) => (
            <div key={task.id} className="py-3 sm:py-4">
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
                    <p className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                      {task.title}
                    </p>
                    <Badge className={cn(getStatusColor(task.status), "text-[10px] px-2 py-0.5")}>
                      {task.status.replace("_", " ")}
                    </Badge>
                    <Badge className={cn(getPriorityColor(task.priority), "text-[10px] px-2 py-0.5")}>
                      {task.priority}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-1.5">
                      {task.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
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
                          {formatDate(task.dueDate)}
                        </span>
                      </span>
                    )}
                    {typeof task.estimatedHours === "number" && (
                      <span>Est. {task.estimatedHours.toFixed(1)}h</span>
                    )}
                    {typeof task.actualHours === "number" && (
                      <span>Actual {task.actualHours.toFixed(1)}h</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/60">
              <tr>
                {canManage && (
                  <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 w-8">
                    Done
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Title
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden md:table-cell">
                  Ticket
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Priority
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden md:table-cell">
                  Assigned To
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden lg:table-cell">
                  Due
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 hidden lg:table-cell">
                  Est / Actual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {tasks.map((task) => (
                <tr key={task.id} className="bg-white dark:bg-neutral-900">
                  {canManage && (
                    <td className="px-4 py-2 align-middle">
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
                  <td className="px-4 py-2 align-middle">
                    <div className="max-w-xs">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {task.title}
                      </div>
                      {task.description && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                          {task.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle hidden md:table-cell">
                    {task.ticket ? (
                      <Link
                        href={`/dashboard/tickets/${task.ticket.id}`}
                        className="text-sm text-neutral-800 dark:text-neutral-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        {task.ticket.ticketNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <Badge className={cn(getStatusColor(task.status), "text-[11px]")}>
                      {task.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <Badge className={cn(getPriorityColor(task.priority), "text-[11px]")}>
                      {task.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 align-middle hidden md:table-cell">
                    {task.assignedTo ? (
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        {formatUserName(task.assignedTo)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-middle hidden lg:table-cell">
                    {task.dueDate ? (
                      <span className="text-sm text-neutral-800 dark:text-neutral-200">
                        {formatDate(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-middle hidden lg:table-cell">
                    <div className="text-xs text-neutral-700 dark:text-neutral-300 space-y-0.5">
                      {typeof task.estimatedHours === "number" && (
                        <div>Est. {task.estimatedHours.toFixed(1)}h</div>
                      )}
                      {typeof task.actualHours === "number" && (
                        <div>Act. {task.actualHours.toFixed(1)}h</div>
                      )}
                      {typeof task.estimatedHours !== "number" &&
                        typeof task.actualHours !== "number" && <>—</>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
