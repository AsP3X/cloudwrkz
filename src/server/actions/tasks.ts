"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canEditProject } from "./projects";
import { revalidatePath } from "next/cache";

export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskDependencyType = "FINISH_TO_START" | "START_TO_START" | "FINISH_TO_FINISH" | "START_TO_FINISH";

export type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedToId?: string;
  estimatedHours?: number;
  startDate?: Date | string;
  dueDate?: Date | string;
  parentTaskId?: string;
  milestoneId?: string;
  ticketId?: string;
  order?: number;
  dependencyIds?: string[]; // Task IDs this task depends on
};

export type TaskUpdateInput = Partial<TaskInput> & {
  completedDate?: Date | string | null;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createTask(
  projectId: string,
  input: TaskInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create tasks for this project",
      };
    }

    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Task title is required",
        fieldErrors: { title: ["Task title cannot be empty"] },
      };
    }

    // Validate parent task belongs to same project
    if (input.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: input.parentTaskId },
        select: { projectId: true },
      });
      if (!parentTask || parentTask.projectId !== projectId) {
        return {
          success: false,
          error: "Parent task must belong to the same project",
        };
      }
    }

    // Validate milestone belongs to same project
    if (input.milestoneId) {
      const milestone = await prisma.milestone.findUnique({
        where: { id: input.milestoneId },
        select: { projectId: true },
      });
      if (!milestone || milestone.projectId !== projectId) {
        return {
          success: false,
          error: "Milestone must belong to the same project",
        };
      }
    }

    const startDate = input.startDate ? new Date(input.startDate) : null;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;

    if (startDate && dueDate && startDate > dueDate) {
      return {
        success: false,
        error: "Due date must be after start date",
        fieldErrors: { dueDate: ["Due date must be after start date"] },
      };
    }

    const task = await prisma.task.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim(),
        status: input.status || "NOT_STARTED",
        priority: input.priority || "MEDIUM",
        assignedToId: input.assignedToId,
        estimatedHours: input.estimatedHours,
        startDate,
        dueDate,
        parentTaskId: input.parentTaskId,
        milestoneId: input.milestoneId,
        ticketId: input.ticketId,
        order: input.order ?? 0,
      },
    });

    // Create dependencies
    if (input.dependencyIds && input.dependencyIds.length > 0) {
      // Validate all dependencies belong to same project
      const dependencies = await prisma.task.findMany({
        where: {
          id: { in: input.dependencyIds },
          projectId,
        },
        select: { id: true },
      });

      if (dependencies.length !== input.dependencyIds.length) {
        return {
          success: false,
          error: "Some dependency tasks do not exist or belong to a different project",
        };
      }

      await prisma.taskDependency.createMany({
        data: input.dependencyIds.map((dependsOnTaskId) => ({
          taskId: task.id,
          dependsOnTaskId,
          type: "FINISH_TO_START",
        })),
        skipDuplicates: true,
      });
    }

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: task.id },
      message: "Task created successfully",
    };
  } catch (error) {
    console.error("Error creating task:", error);
    return {
      success: false,
      error: "Failed to create task. Please try again.",
    };
  }
}

export async function updateTask(
  taskId: string,
  input: TaskUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, parentTaskId: true },
    });

    if (!task) {
      return {
        success: false,
        error: "Task not found",
      };
    }

    if (!(await canEditProject(user.id, task.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this task",
      };
    }

    // Prevent circular parent references
    if (input.parentTaskId && input.parentTaskId === taskId) {
      return {
        success: false,
        error: "A task cannot be its own parent",
      };
    }

    // Validate parent task
    if (input.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: input.parentTaskId },
        select: { projectId: true },
      });
      if (!parentTask || parentTask.projectId !== task.projectId) {
        return {
          success: false,
          error: "Parent task must belong to the same project",
        };
      }
    }

    const startDate = input.startDate ? new Date(input.startDate) : undefined;
    const dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    const completedDate = input.completedDate
      ? new Date(input.completedDate)
      : input.completedDate === null
      ? null
      : undefined;

    if (startDate && dueDate && startDate > dueDate) {
      return {
        success: false,
        error: "Due date must be after start date",
        fieldErrors: { dueDate: ["Due date must be after start date"] },
      };
    }

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.status !== undefined) updateData.status = input.status;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.assignedToId !== undefined) updateData.assignedToId = input.assignedToId;
    if (input.estimatedHours !== undefined) updateData.estimatedHours = input.estimatedHours;
    if (input.startDate !== undefined) updateData.startDate = startDate;
    if (input.dueDate !== undefined) updateData.dueDate = dueDate;
    if (input.completedDate !== undefined) updateData.completedDate = completedDate;
    if (input.parentTaskId !== undefined) updateData.parentTaskId = input.parentTaskId;
    if (input.milestoneId !== undefined) updateData.milestoneId = input.milestoneId;
    if (input.ticketId !== undefined) updateData.ticketId = input.ticketId;
    if (input.order !== undefined) updateData.order = input.order;

    // Auto-set completedDate if status is COMPLETED
    if (input.status === "COMPLETED" && !completedDate) {
      updateData.completedDate = new Date();
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    // Update dependencies if provided
    if (input.dependencyIds !== undefined) {
      // Remove existing dependencies
      await prisma.taskDependency.deleteMany({
        where: { taskId },
      });

      // Add new dependencies
      if (input.dependencyIds.length > 0) {
        const dependencies = await prisma.task.findMany({
          where: {
            id: { in: input.dependencyIds },
            projectId: task.projectId,
          },
          select: { id: true },
        });

        if (dependencies.length > 0) {
          await prisma.taskDependency.createMany({
            data: dependencies.map((dep) => ({
              taskId,
              dependsOnTaskId: dep.id,
              type: "FINISH_TO_START",
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    revalidatePath(`/dashboard/projects/${task.projectId}`);

    return {
      success: true,
      message: "Task updated successfully",
    };
  } catch (error) {
    console.error("Error updating task:", error);
    return {
      success: false,
      error: "Failed to update task. Please try again.",
    };
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    if (!task) {
      return {
        success: false,
        error: "Task not found",
      };
    }

    if (!(await canEditProject(user.id, task.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this task",
      };
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    revalidatePath(`/dashboard/projects/${task.projectId}`);

    return {
      success: true,
      message: "Task deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting task:", error);
    return {
      success: false,
      error: "Failed to delete task. Please try again.",
    };
  }
}

export async function getProjectTasks(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
        },
      },
      milestone: {
        select: {
          id: true,
          name: true,
        },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
        },
      },
      dependencies: {
        include: {
          dependsOnTask: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      subtasks: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          subtasks: true,
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // Calculate actual hours from time entries
  const taskIds = tasks.map((t) => t.id);
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      ticketId: { in: tasks.filter((t) => t.ticketId).map((t) => t.ticketId!) },
      status: "COMPLETED",
    },
    select: {
      ticketId: true,
      totalDuration: true,
    },
  });

  const hoursByTicket = new Map<string, number>();
  for (const entry of timeEntries) {
    if (entry.ticketId) {
      const current = hoursByTicket.get(entry.ticketId) || 0;
      hoursByTicket.set(entry.ticketId, current + entry.totalDuration / 3600);
    }
  }

  return tasks.map((task) => ({
    ...task,
    actualHours: task.ticketId ? hoursByTicket.get(task.ticketId) || 0 : null,
  }));
}
