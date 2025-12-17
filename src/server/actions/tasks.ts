"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";

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

/**
 * Create a new task.
 *
 * Note: For ticket-scoped tasks, prefer using createTicketTask which
 * will also revalidate the ticket detail page.
 */

export async function createTask(
  input: TaskInput
): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if tasks module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TASKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Tasks module is not enabled",
      };
    }

    // Check permission (this also calls requireAuth internally)
    const user = await requireAnyPermission("tasks.create");

    // Tasks are completely independent of projects

    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Task title is required",
        fieldErrors: { title: ["Task title cannot be empty"] },
      };
    }

    // Validate parent task exists (no project validation needed - tasks are independent)
    if (input.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: input.parentTaskId },
        select: { id: true },
      });
      if (!parentTask) {
        return {
          success: false,
          error: "Parent task not found",
        };
      }
    }

    // Validate milestone exists (no project validation needed - tasks are independent)
    if (input.milestoneId) {
      const milestone = await prisma.milestone.findUnique({
        where: { id: input.milestoneId },
        select: { id: true },
      });
      if (!milestone) {
        return {
          success: false,
          error: "Milestone not found",
        };
      }
    }

    // Handle dates - convert string/Date to Date or null
    let startDate: Date | null = null;
    let dueDate: Date | null = null;
    
    if (input.startDate) {
      const parsed = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }
    
    if (input.dueDate) {
      const parsed = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed;
      }
    }

    if (startDate && dueDate && startDate > dueDate) {
      return {
        success: false,
        error: "Due date must be after start date",
        fieldErrors: { dueDate: ["Due date must be after start date"] },
      };
    }

    // Create task - tasks are completely independent of projects
    // Build data object, only including fields that are not undefined
    const taskData: any = {
      title: input.title.trim(),
      status: input.status || "NOT_STARTED",
      priority: input.priority || "MEDIUM",
      order: input.order ?? 0,
    };

    // Only add optional fields if they have values (not undefined)
    if (input.description !== undefined && input.description !== null) {
      taskData.description = input.description.trim() || null;
    }
    
    // Handle assignment: auto-assign to creator if not specified, or validate assignment to others
    if (input.assignedToId !== undefined && input.assignedToId !== null) {
      // If assigning to someone other than the creator, validate they're in the same group
      // (unless user is ADMIN, AGENT, or MODERATOR who can assign to anyone)
      if (input.assignedToId !== user.id && user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
        const { areUsersInSameGroup } = await import("@/lib/utils/permissions");
        const inSameGroup = await areUsersInSameGroup(user.id, input.assignedToId);
        if (!inSameGroup) {
          return {
            success: false,
            error: "You can only assign tasks to users in your group. Please contact an administrator if you need to assign to someone else.",
            fieldErrors: { assignedToId: ["You can only assign tasks to users in your group"] },
          };
        }
      }
      taskData.assignedToId = input.assignedToId;
    } else {
      // Auto-assign to creator if no assignment specified
      taskData.assignedToId = user.id;
    }
    if (input.estimatedHours !== undefined && input.estimatedHours !== null) {
      taskData.estimatedHours = input.estimatedHours;
    }
    if (startDate !== null) {
      taskData.startDate = startDate;
    }
    if (dueDate !== null) {
      taskData.dueDate = dueDate;
    }
    if (input.parentTaskId !== undefined && input.parentTaskId !== null) {
      taskData.parentTaskId = input.parentTaskId;
    }
    if (input.milestoneId !== undefined && input.milestoneId !== null) {
      taskData.milestoneId = input.milestoneId;
    }
    if (input.ticketId !== undefined && input.ticketId !== null) {
      taskData.ticketId = input.ticketId;
    }

    // Generate sequential task number in the format #TSK-000001
    const existingTasks = await prisma.task.findMany({
      where: {
        taskNumber: {
          startsWith: "#TSK-",
        },
      },
      select: {
        taskNumber: true,
      },
      orderBy: {
        taskNumber: "desc",
      },
      take: 1,
    });

    let nextSequence = 1;
    if (existingTasks.length > 0 && existingTasks[0].taskNumber) {
      const match = existingTasks[0].taskNumber.match(/^#TSK-(\d+)$/);
      if (match) {
        nextSequence = parseInt(match[1], 10) + 1;
      }
    }

    const padded = nextSequence.toString().padStart(6, "0");
    taskData.taskNumber = `#TSK-${padded}`;

    const task = await prisma.task.create({
      data: taskData,
    });

    // Create dependencies (no project validation - tasks are independent)
    if (input.dependencyIds && input.dependencyIds.length > 0) {
      // Validate all dependencies exist
      const dependencies = await prisma.task.findMany({
        where: {
          id: { in: input.dependencyIds },
        },
        select: { id: true },
      });

      if (dependencies.length !== input.dependencyIds.length) {
        return {
          success: false,
          error: "Some dependency tasks do not exist",
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

    // Tasks are independent - only revalidate tasks page
    revalidatePath(`/dashboard/tasks`);

    return {
      success: true,
      data: { id: task.id },
      message: "Task created successfully",
    };
  } catch (error) {
    console.error("Error creating task:", error);
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle permission errors
    if (errorMessage.includes("Forbidden") || errorMessage.includes("Missing")) {
      return {
        success: false,
        error: "You don't have permission to create tasks. Please contact an administrator.",
      };
    }
    
    // Handle module disabled errors
    if (errorMessage.includes("not enabled")) {
      return {
        success: false,
        error: errorMessage,
      };
    }
    
    // Handle database constraint errors
    if (errorMessage.includes("Unique constraint")) {
      return {
        success: false,
        error: "A task with this information already exists.",
      };
    }
    
    if (errorMessage.includes("Foreign key constraint")) {
      return {
        success: false,
        error: "Invalid reference (user, ticket, or milestone not found).",
      };
    }
    
    if (errorMessage.includes("Invalid value") || errorMessage.includes("Invalid enum")) {
      return {
        success: false,
        error: "Invalid data provided. Please check your input.",
      };
    }
    
    // Generic error
    return {
      success: false,
      error: `Failed to create task: ${errorMessage}`,
    };
  }
}

/**
 * Convenience helper for creating a task that is attached to a specific ticket.
 *
 * This will:
 * - Ensure the ticket exists
 * - Delegate to createTask
 * - Revalidate the ticket detail page on success
 */
export async function createTicketTask(
  ticketId: string,
  input: Omit<TaskInput, "ticketId">
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAuth();

    // Ensure ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
      },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    const result = await createTask({
      ...input,
      ticketId,
    });

    if (result.success) {
      // Also revalidate the ticket detail page so the new task appears
      revalidatePath(`/dashboard/tickets/${ticketId}`);
    }

    return result;
  } catch (error) {
    console.error("Error creating ticket task:", error);
    return {
      success: false,
      error: "Failed to create task for ticket. Please try again.",
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
      select: { parentTaskId: true, assignedToId: true },
    });

    if (!task) {
      return {
        success: false,
        error: "Task not found",
      };
    }

    // Tasks are independent - check task permissions, not project permissions
    // Admins, agents, and moderators can always update
    const { hasPermission } = await import("@/lib/utils/permissions");
    if (
      user.role !== "ADMIN" &&
      user.role !== "AGENT" &&
      user.role !== "MODERATOR" &&
      !(await hasPermission(user.id, "tasks.update"))
    ) {
      return {
        success: false,
        error: "You don't have permission to update this task",
      };
    }

    // Only the assigned user can update the task (unless ADMIN/AGENT/MODERATOR)
    if (user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
      if (!task.assignedToId || task.assignedToId !== user.id) {
        return {
          success: false,
          error: "You can only update tasks assigned to you",
        };
      }
    }

    // Prevent circular parent references
    if (input.parentTaskId && input.parentTaskId === taskId) {
      return {
        success: false,
        error: "A task cannot be its own parent",
      };
    }

    // Validate parent task exists (no project validation - tasks are independent)
    if (input.parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: input.parentTaskId },
        select: { id: true },
      });
      if (!parentTask) {
        return {
          success: false,
          error: "Parent task not found",
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

    // Validate assignment change if provided
    if (input.assignedToId !== undefined && input.assignedToId !== task.assignedToId) {
      // If assigning to someone other than the current user, validate they're in the same group
      // (unless user is ADMIN, AGENT, or MODERATOR who can assign to anyone)
      if (
        input.assignedToId !== user.id &&
        user.role !== "ADMIN" &&
        user.role !== "AGENT" &&
        user.role !== "MODERATOR"
      ) {
        const { areUsersInSameGroup } = await import("@/lib/utils/permissions");
        const inSameGroup = await areUsersInSameGroup(user.id, input.assignedToId);
        if (!inSameGroup) {
          return {
            success: false,
            error: "You can only assign tasks to users in your group. Please contact an administrator if you need to assign to someone else.",
            fieldErrors: { assignedToId: ["You can only assign tasks to users in your group"] },
          };
        }
      }
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

      // Add new dependencies (no project validation - tasks are independent)
      if (input.dependencyIds.length > 0) {
        const dependencies = await prisma.task.findMany({
          where: {
            id: { in: input.dependencyIds },
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

    // Tasks are independent - only revalidate tasks page
    revalidatePath(`/dashboard/tasks`);

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

/**
 * Update a task that is attached to a specific ticket.
 *
 * This is a thin wrapper around updateTask that:
 * - Ensures the task exists and belongs to a ticket
 * - Revalidates the ticket detail page on success
 */
export async function updateTicketTask(
  taskId: string,
  input: TaskUpdateInput
): Promise<ActionResult> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        ticketId: true,
      },
    });

    if (!task) {
      return {
        success: false,
        error: "Task not found",
      };
    }

    if (!task.ticketId) {
      return {
        success: false,
        error: "This task is not linked to a ticket",
      };
    }

    const result = await updateTask(taskId, input);

    if (result.success) {
      revalidatePath(`/dashboard/tickets/${task.ticketId}`);
    }

    return result;
  } catch (error) {
    console.error("Error updating ticket task:", error);
    return {
      success: false,
      error: "Failed to update task for ticket. Please try again.",
    };
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assignedToId: true },
    });

    if (!task) {
      return {
        success: false,
        error: "Task not found",
      };
    }

    // Tasks are independent - check task permissions, not project permissions
    // Admins, agents, and moderators can always delete
    const { hasPermission } = await import("@/lib/utils/permissions");
    if (
      user.role !== "ADMIN" &&
      user.role !== "AGENT" &&
      user.role !== "MODERATOR" &&
      !(await hasPermission(user.id, "tasks.delete"))
    ) {
      return {
        success: false,
        error: "You don't have permission to delete this task",
      };
    }

    // Only the assigned user can delete the task (unless ADMIN/AGENT/MODERATOR)
    if (user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
      if (!task.assignedToId || task.assignedToId !== user.id) {
        return {
          success: false,
          error: "You can only delete tasks assigned to you",
        };
      }
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    // Tasks are independent - only revalidate tasks page
    revalidatePath(`/dashboard/tasks`);

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
  // Tasks are now independent of projects - this function is deprecated
  // Return empty array since tasks no longer belong to projects
  return [];
}

/**
 * Get all tasks that are linked to a specific ticket.
 * Tasks are independent of projects.
 * Only shows tasks assigned to the current user (unless ADMIN/AGENT/MODERATOR).
 */
export async function getTicketTasks(ticketId: string) {
  const user = await requireAuth();

  // Ensure ticket exists
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
    },
  });

  if (!ticket) {
    return [];
  }

  // Only show tasks assigned to the current user
  // Admins, agents, and moderators can see all tasks
  const whereClause: any = { ticketId };
  if (user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
    whereClause.assignedToId = user.id;
  }

  // Get tasks linked to this ticket (tasks are independent of projects)
  const tasks = await prisma.task.findMany({
    where: whereClause,
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
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      ticketId,
      status: "COMPLETED",
    },
    select: {
      ticketId: true,
      totalDuration: true,
    },
  });

  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.totalDuration / 3600, 0);

  return tasks.map((task) => ({
    ...task,
    actualHours: totalHours || null,
  }));
}

/**
 * Get all tasks that the user can view.
 * Tasks are completely independent of projects.
 * This is used for the standalone tasks page.
 * Only shows tasks assigned to the current user (unless ADMIN/AGENT/MODERATOR).
 */
export async function getAllTasks() {
  const user = await requireAuth();

  // Only show tasks assigned to the current user
  // Admins, agents, and moderators can see all tasks
  const whereClause: any = {};
  if (user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
    whereClause.assignedToId = user.id;
  }

  // Tasks are independent - get tasks filtered by assignment
  const tasks = await prisma.task.findMany({
    where: whereClause,
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
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  // Calculate actual hours from time entries
  const ticketIds = tasks.filter((t) => t.ticketId).map((t) => t.ticketId!);
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      ticketId: { in: ticketIds },
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

/**
 * Get a single task by ID with all related data.
 * Tasks are completely independent of projects.
 */
export async function getTask(id: string) {
  const user = await requireAuth();

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      },
      parentTask: {
        select: {
          id: true,
          title: true,
          status: true,
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
          priority: true,
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: {
          subtasks: true,
        },
      },
    },
  });

  if (!task) {
    return null;
  }

  // Check if tasks module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TASKS);
  if (!moduleEnabled) {
    return null;
  }

  // Check permissions - tasks are independent, so we check general task permissions
  // Admins, agents, and moderators can always view
  const { hasPermission } = await import("@/lib/utils/permissions");
  if (
    user.role !== "ADMIN" &&
    user.role !== "AGENT" &&
    user.role !== "MODERATOR" &&
    !(await hasPermission(user.id, "tasks.view"))
  ) {
    return null;
  }

  // Only the assigned user can view the task (unless ADMIN/AGENT/MODERATOR)
  if (user.role !== "ADMIN" && user.role !== "AGENT" && user.role !== "MODERATOR") {
    if (!task.assignedToId || task.assignedToId !== user.id) {
      return null;
    }
  }

  // Calculate actual hours from time entries if task is linked to a ticket
  let actualHours: number | null = null;
  if (task.ticketId) {
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        ticketId: task.ticketId,
        status: "COMPLETED",
      },
      select: {
        totalDuration: true,
      },
    });

    actualHours = timeEntries.reduce((sum, entry) => sum + entry.totalDuration / 3600, 0) || null;
  }

  return {
    ...task,
    actualHours,
  };
}
