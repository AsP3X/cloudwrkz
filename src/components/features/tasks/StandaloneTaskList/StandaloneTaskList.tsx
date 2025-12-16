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

  // Separate active and completed tasks
  const activeTasks = tasks.filter((task) => task.status !== "COMPLETED");
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");

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
              href={`/dashboard/tasks/${task.id}`}
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
          href={`/dashboard/tasks/${task.id}`}
          className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <div className="max-w-md">
            <div className="truncate">{task.title}</div>
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
            {formatDate(task.dueDate)}
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
      {/* Active Tasks */}
      {activeTasks.length > 0 && (
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
      {completedTasks.length > 0 && (
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
