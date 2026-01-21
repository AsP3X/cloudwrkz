"use client";

import React from "react";
import Link from "next/link";
import { StandaloneTaskList } from "@/components/features/tasks/StandaloneTaskList";
import { Button } from "@/components/ui/Button";
import { TaskViewToggle, getInitialTaskViewMode, TaskViewMode, saveTaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { ROUTES } from "@/lib/constants/routes";

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

interface ArchivePageClientProps {
  tasks: Task[];
  canManage: boolean;
  userTimezone?: string;
}

export function ArchivePageClient({ tasks, canManage, userTimezone = "UTC" }: ArchivePageClientProps) {
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");
  const [isReady, setIsReady] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useLayoutEffect(() => {
    const initial = getInitialTaskViewMode();

    const updateIsDesktop = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktop(desktop);

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

    return () => window.removeEventListener("resize", updateIsDesktop);
  }, []);

  const handleViewChange = (mode: TaskViewMode) => {
    setViewMode(mode);
    saveTaskViewMode(mode);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            ToDo Archive
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Archived todos are hidden from the main overview.
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
          <Link href={ROUTES.TODOS}>
            <Button variant="outline">Back to ToDos</Button>
          </Link>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No archived todos
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Archived items will appear here after you archive them.
          </p>
          <Link href={ROUTES.TODOS}>
            <Button variant="primary">Go to ToDos</Button>
          </Link>
        </div>
      ) : (
        <StandaloneTaskList
          tasks={tasks as any}
          viewMode={viewMode}
          canManage={canManage}
          userTimezone={userTimezone}
        />
      )}
    </div>
  );
}

