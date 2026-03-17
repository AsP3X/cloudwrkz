"use client";

import React from "react";
import { TaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { SubtasksSection } from "@/components/features/tasks/SubtasksSection/SubtasksSection";

interface Subtask {
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
}

interface TaskDetailContentProps {
  parentTaskId: string;
  subtasks: Subtask[];
  canManage: boolean;
  userTimezone?: string;
}

export const TaskDetailContent = ({ parentTaskId, subtasks, canManage, userTimezone = "UTC" }: TaskDetailContentProps) => {
  // Start with default "table" to avoid hydration mismatch, then update from localStorage on client
  const [viewMode, setViewMode] = React.useState<TaskViewMode>("table");
  const [mounted, setMounted] = React.useState(false);

  // Initialize from localStorage only on client after mount
  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("task-view-mode");
      if (stored && (stored === "table" || stored === "card")) {
        setViewMode(stored as TaskViewMode);
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }, []);

  // Sync with localStorage when window gains focus (user might have changed it in another tab/window)
  React.useEffect(() => {
    if (!mounted) return;

    const handleFocus = () => {
      const stored = localStorage.getItem("task-view-mode");
      if (stored && (stored === "table" || stored === "card")) {
        setViewMode(stored as TaskViewMode);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [mounted]);

  return (
    <SubtasksSection
      parentTaskId={parentTaskId}
      subtasks={subtasks}
      canManage={canManage}
      viewMode={viewMode}
      onViewChange={(mode) => {
        setViewMode(mode);
        if (mounted) {
          localStorage.setItem("task-view-mode", mode);
        }
      }}
      userTimezone={userTimezone}
    />
  );
};
