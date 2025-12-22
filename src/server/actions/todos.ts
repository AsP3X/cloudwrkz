"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { sanitizeHtml, extractPlainText } from "@/lib/utils/rich-text";

/**
 * Check if an agent has access to a ticket
 * Agents have access if:
 * - Ticket is assigned to them directly
 * - Ticket is assigned to a group they're a member of
 * - They created the ticket
 */
async function agentHasTicketAccess(agentId: string, ticketId: string): Promise<boolean> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      createdById: true,
      assignedToId: true,
      assignedToGroupId: true,
    },
  });

  if (!ticket) {
    return false;
  }

  // Creator always has access
  if (ticket.createdById === agentId) {
    return true;
  }

  // Assigned directly
  if (ticket.assignedToId === agentId) {
    return true;
  }

  // Assigned to a group the agent is in
  if (ticket.assignedToGroupId) {
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: agentId,
          groupId: ticket.assignedToGroupId,
        },
      },
    });
    if (membership) {
      return true;
    }
  }

  return false;
}

export type TodoStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type TodoPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TodoDependencyType = "FINISH_TO_START" | "START_TO_START" | "FINISH_TO_FINISH" | "START_TO_FINISH";

export type TodoInput = {
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  assignedToId?: string;
  estimatedHours?: number;
  startDate?: Date | string;
  dueDate?: Date | string;
  parentTodoId?: string;
  milestoneId?: string;
  ticketId?: string;
  order?: number;
  dependencyIds?: string[]; // Todo IDs this todo depends on
};

export type TodoUpdateInput = Partial<TodoInput> & {
  completedDate?: Date | string | null;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Create a new todo.
 *
 * Note: For ticket-scoped todos, prefer using createTicketTodo which
 * will also revalidate the ticket detail page.
 */

export async function createTodo(
  input: TodoInput
): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if todos module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TODOS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Todos module is not enabled",
      };
    }

    // Check permission (this also calls requireAuth internally)
    const user = await requireAnyPermission("todos.create");

    // Todos are completely independent of projects

    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Todo title is required",
        fieldErrors: { title: ["Todo title cannot be empty"] },
      };
    }

    // Validate parent todo exists (no project validation needed - todos are independent)
    if (input.parentTodoId) {
      const parentTodo = await prisma.todo.findUnique({
        where: { id: input.parentTodoId },
        select: { id: true },
      });
      if (!parentTodo) {
        return {
          success: false,
          error: "Parent todo not found",
        };
      }
    }

    // Validate milestone exists (no project validation needed - todos are independent)
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

    // Create todo - todos are completely independent of projects
    // Build data object, only including fields that are not undefined
    const todoData: any = {
      title: input.title.trim(),
      status: input.status || "NOT_STARTED",
      priority: input.priority || "MEDIUM",
      order: input.order ?? 0,
    };

    // Process description similar to tickets: store sanitized HTML and plain text
    if (input.description !== undefined && input.description !== null) {
      const rawHtml = input.description;
      const descriptionHtml = rawHtml ? sanitizeHtml(rawHtml) : null;
      const descriptionPlain = descriptionHtml ? extractPlainText(descriptionHtml) : null;

      // Keep legacy description field in sync with plain text for backward compatibility
      todoData.description = descriptionPlain;
      todoData.descriptionHtml = descriptionHtml;
      todoData.descriptionPlain = descriptionPlain;
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
            error: "You can only assign todos to users in your group. Please contact an administrator if you need to assign to someone else.",
            fieldErrors: { assignedToId: ["You can only assign todos to users in your group"] },
          };
        }
      }
      todoData.assignedToId = input.assignedToId;
    } else {
      // Auto-assign to creator if no assignment specified
      todoData.assignedToId = user.id;
    }
    if (input.estimatedHours !== undefined && input.estimatedHours !== null) {
      todoData.estimatedHours = input.estimatedHours;
    }
    if (startDate !== null) {
      todoData.startDate = startDate;
    }
    if (dueDate !== null) {
      todoData.dueDate = dueDate;
    }
    if (input.parentTodoId !== undefined && input.parentTodoId !== null) {
      todoData.parentTodoId = input.parentTodoId;
    }
    if (input.milestoneId !== undefined && input.milestoneId !== null) {
      todoData.milestoneId = input.milestoneId;
    }
    if (input.ticketId !== undefined && input.ticketId !== null) {
      todoData.ticketId = input.ticketId;
    }

    // Generate sequential todo number in the format #TDO-000001
    const existingTodos = await prisma.todo.findMany({
      where: {
        todoNumber: {
          startsWith: "#TDO-",
        },
      },
      select: {
        todoNumber: true,
      },
      orderBy: {
        todoNumber: "desc",
      },
      take: 1,
    });

    let nextSequence = 1;
    if (existingTodos.length > 0 && existingTodos[0].todoNumber) {
      const match = existingTodos[0].todoNumber.match(/^#TDO-(\d+)$/);
      if (match) {
        nextSequence = parseInt(match[1], 10) + 1;
      }
    }

    const padded = nextSequence.toString().padStart(6, "0");
    todoData.todoNumber = `#TDO-${padded}`;

    const todo = await prisma.todo.create({
      data: todoData,
    });

    // Create dependencies (no project validation - todos are independent)
    if (input.dependencyIds && input.dependencyIds.length > 0) {
      // Validate all dependencies exist
      const dependencies = await prisma.todo.findMany({
        where: {
          id: { in: input.dependencyIds },
        },
        select: { id: true },
      });

      if (dependencies.length !== input.dependencyIds.length) {
        return {
          success: false,
          error: "Some dependency todos do not exist",
        };
      }

      await prisma.todoDependency.createMany({
        data: input.dependencyIds.map((dependsOnTodoId) => ({
          todoId: todo.id,
          dependsOnTodoId,
          type: "FINISH_TO_START",
        })),
        skipDuplicates: true,
      });
    }

    // Todos are independent - only revalidate todos page
    revalidatePath(`/dashboard/todos`);

    return {
      success: true,
      data: { id: todo.id },
      message: "Todo created successfully",
    };
  } catch (error) {
    console.error("Error creating todo:", error);
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle permission errors
    if (errorMessage.includes("Forbidden") || errorMessage.includes("Missing")) {
      return {
        success: false,
        error: "You don't have permission to create todos. Please contact an administrator.",
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
        error: "A todo with this information already exists.",
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
      error: `Failed to create todo: ${errorMessage}`,
    };
  }
}

/**
 * Convenience helper for creating a todo that is attached to a specific ticket.
 *
 * This will:
 * - Ensure the ticket exists
 * - Delegate to createTodo
 * - Revalidate the ticket detail page on success
 */
export async function createTicketTodo(
  ticketId: string,
  input: Omit<TodoInput, "ticketId">
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

    const result = await createTodo({
      ...input,
      ticketId,
    });

    if (result.success) {
      // Also revalidate the ticket detail page so the new todo appears
      revalidatePath(`/dashboard/tickets/${ticketId}`);
    }

    return result;
  } catch (error) {
    console.error("Error creating ticket todo:", error);
    return {
      success: false,
      error: "Failed to create todo for ticket. Please try again.",
    };
  }
}

/**
 * Convenience helper for creating a subtodo attached to a specific parent todo.
 *
 * This delegates to createTodo and ensures the parent exists.
 */
export async function createSubtodo(
  parentTodoId: string,
  input: Omit<TodoInput, "parentTodoId" | "ticketId" | "milestoneId">
): Promise<ActionResult<{ id: string }>> {
  try {
    // Reuse the same permission/module checks as createTodo
    const parent = await prisma.todo.findUnique({
      where: { id: parentTodoId },
      select: { id: true, ticketId: true, milestoneId: true },
    });

    if (!parent) {
      return {
        success: false,
        error: "Parent todo not found",
      };
    }

    const result = await createTodo({
      ...input,
      parentTodoId,
      ticketId: parent.ticketId ?? undefined,
      milestoneId: parent.milestoneId ?? undefined,
    });

    if (result.success) {
      // Revalidate both the standalone todos page and the parent detail page
      revalidatePath(`/dashboard/todos/${parentTodoId}`);
      if (parent.ticketId) {
        revalidatePath(`/dashboard/tickets/${parent.ticketId}`);
      }
    }

    return result;
  } catch (error) {
    console.error("Error creating subtodo:", error);
    return {
      success: false,
      error: "Failed to create subtodo. Please try again.",
    };
  }
}

export async function updateTodo(
  todoId: string,
  input: TodoUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const todo = await prisma.todo.findUnique({
      where: { id: todoId },
      select: { parentTodoId: true, assignedToId: true, ticketId: true },
    });

    if (!todo) {
      return {
        success: false,
        error: "Todo not found",
      };
    }

    // Todos are independent - check todo permissions, not project permissions
    // Admins and moderators can always update
    const { hasPermission } = await import("@/lib/utils/permissions");
    if (
      user.role !== "ADMIN" &&
      user.role !== "AGENT" &&
      user.role !== "MODERATOR" &&
      !(await hasPermission(user.id, "todos.update"))
    ) {
      return {
        success: false,
        error: "You don't have permission to update this todo",
      };
    }

    // Check access based on role
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // Admins and moderators can update all todos
    } else if (user.role === "AGENT") {
      // Agents can update todos if:
      // 1. Todo is assigned to them, OR
      // 2. Todo is linked to a ticket they have access to
      if (todo.assignedToId === user.id) {
        // Assigned to agent - allow update
      } else if (todo.ticketId) {
        // Check if agent has access to the ticket
        const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
        if (!hasAccess) {
          return {
            success: false,
            error: "You can only update todos assigned to you or todos linked to tickets you have access to",
          };
        }
      } else {
        // Todo not assigned and not linked to ticket - deny update
        return {
          success: false,
          error: "You can only update todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // Regular users can only update todos assigned to them
      if (!todo.assignedToId || todo.assignedToId !== user.id) {
        return {
          success: false,
          error: "You can only update todos assigned to you",
        };
      }
    }

    // Prevent circular parent references
    if (input.parentTodoId && input.parentTodoId === todoId) {
      return {
        success: false,
        error: "A todo cannot be its own parent",
      };
    }

    // Validate parent todo exists (no project validation - todos are independent)
    if (input.parentTodoId) {
      const parentTodo = await prisma.todo.findUnique({
        where: { id: input.parentTodoId },
        select: { id: true },
      });
      if (!parentTodo) {
        return {
          success: false,
          error: "Parent todo not found",
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
    if (input.assignedToId !== undefined && input.assignedToId !== todo.assignedToId) {
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
            error: "You can only assign todos to users in your group. Please contact an administrator if you need to assign to someone else.",
            fieldErrors: { assignedToId: ["You can only assign todos to users in your group"] },
          };
        }
      }
    }

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) {
      const rawHtml = input.description;
      const descriptionHtml = rawHtml ? sanitizeHtml(rawHtml) : null;
      const descriptionPlain = descriptionHtml ? extractPlainText(descriptionHtml) : null;

      updateData.description = descriptionPlain;
      updateData.descriptionHtml = descriptionHtml;
      updateData.descriptionPlain = descriptionPlain;
    }
    if (input.status !== undefined) updateData.status = input.status;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.assignedToId !== undefined) updateData.assignedToId = input.assignedToId;
    if (input.estimatedHours !== undefined) updateData.estimatedHours = input.estimatedHours;
    if (input.startDate !== undefined) updateData.startDate = startDate;
    if (input.dueDate !== undefined) updateData.dueDate = dueDate;
    if (input.completedDate !== undefined) updateData.completedDate = completedDate;
    if (input.parentTodoId !== undefined) updateData.parentTodoId = input.parentTodoId;
    if (input.milestoneId !== undefined) updateData.milestoneId = input.milestoneId;
    if (input.ticketId !== undefined) updateData.ticketId = input.ticketId;
    if (input.order !== undefined) updateData.order = input.order;

    // Auto-set completedDate if status is COMPLETED
    if (input.status === "COMPLETED" && !completedDate) {
      updateData.completedDate = new Date();
    }

    await prisma.todo.update({
      where: { id: todoId },
      data: updateData,
    });

    // Update dependencies if provided
    if (input.dependencyIds !== undefined) {
      // Remove existing dependencies
      await prisma.todoDependency.deleteMany({
        where: { todoId },
      });

      // Add new dependencies (no project validation - todos are independent)
      if (input.dependencyIds.length > 0) {
        const dependencies = await prisma.todo.findMany({
          where: {
            id: { in: input.dependencyIds },
          },
          select: { id: true },
        });

        if (dependencies.length > 0) {
          await prisma.todoDependency.createMany({
            data: dependencies.map((dep) => ({
              todoId,
              dependsOnTodoId: dep.id,
              type: "FINISH_TO_START",
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // Todos are independent - only revalidate todos page
    revalidatePath(`/dashboard/todos`);

    return {
      success: true,
      message: "Todo updated successfully",
    };
  } catch (error) {
    console.error("Error updating todo:", error);
    return {
      success: false,
      error: "Failed to update todo. Please try again.",
    };
  }
}

/**
 * Update a todo that is attached to a specific ticket.
 *
 * This is a thin wrapper around updateTodo that:
 * - Ensures the todo exists and belongs to a ticket
 * - Revalidates the ticket detail page on success
 */
export async function updateTicketTodo(
  todoId: string,
  input: TodoUpdateInput
): Promise<ActionResult> {
  try {
    const todo = await prisma.todo.findUnique({
      where: { id: todoId },
      select: {
        id: true,
        ticketId: true,
      },
    });

    if (!todo) {
      return {
        success: false,
        error: "Todo not found",
      };
    }

    if (!todo.ticketId) {
      return {
        success: false,
        error: "This todo is not linked to a ticket",
      };
    }

    const result = await updateTodo(todoId, input);

    if (result.success) {
      revalidatePath(`/dashboard/tickets/${todo.ticketId}`);
    }

    return result;
  } catch (error) {
    console.error("Error updating ticket todo:", error);
    return {
      success: false,
      error: "Failed to update todo for ticket. Please try again.",
    };
  }
}

export async function deleteTodo(todoId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const todo = await prisma.todo.findUnique({
      where: { id: todoId },
      select: { id: true, assignedToId: true, ticketId: true },
    });

    if (!todo) {
      return {
        success: false,
        error: "Todo not found",
      };
    }

    // Todos are independent - check todo permissions, not project permissions
    // Admins and moderators can always delete
    const { hasPermission } = await import("@/lib/utils/permissions");
    if (
      user.role !== "ADMIN" &&
      user.role !== "AGENT" &&
      user.role !== "MODERATOR" &&
      !(await hasPermission(user.id, "todos.delete"))
    ) {
      return {
        success: false,
        error: "You don't have permission to delete this todo",
      };
    }

    // Check access based on role
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // Admins and moderators can delete all todos
    } else if (user.role === "AGENT") {
      // Agents can delete todos if:
      // 1. Todo is assigned to them, OR
      // 2. Todo is linked to a ticket they have access to
      if (todo.assignedToId === user.id) {
        // Assigned to agent - allow delete
      } else if (todo.ticketId) {
        // Check if agent has access to the ticket
        const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
        if (!hasAccess) {
          return {
            success: false,
            error: "You can only delete todos assigned to you or todos linked to tickets you have access to",
          };
        }
      } else {
        // Todo not assigned and not linked to ticket - deny delete
        return {
          success: false,
          error: "You can only delete todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // Regular users can only delete todos assigned to them
      if (!todo.assignedToId || todo.assignedToId !== user.id) {
        return {
          success: false,
          error: "You can only delete todos assigned to you",
        };
      }
    }

    // Recursively delete all subtodos first, then delete the parent todo
    // This ensures that when a parent todo is deleted, all its subtodos are also deleted
    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      const deleteTodoAndSubtodos = async (todoIdToDelete: string): Promise<void> => {
        // Find all direct subtodos
        const subtodos = await tx.todo.findMany({
          where: { parentTodoId: todoIdToDelete },
          select: { id: true },
        });

        // Recursively delete all subtodos first
        for (const subtodo of subtodos) {
          await deleteTodoAndSubtodos(subtodo.id);
        }

        // Delete the todo itself
        await tx.todo.delete({
          where: { id: todoIdToDelete },
        });
      };

      // Delete the todo and all its subtodos recursively
      await deleteTodoAndSubtodos(todoId);
    });

    // Todos are independent - only revalidate todos page
    revalidatePath(`/dashboard/todos`);

    return {
      success: true,
      message: "Todo deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting todo:", error);
    return {
      success: false,
      error: "Failed to delete todo. Please try again.",
    };
  }
}

export async function getProjectTodos(projectId: string) {
  // Todos are now independent of projects - this function is deprecated
  // Return empty array since todos no longer belong to projects
  return [];
}

/**
 * Get all todos that are linked to a specific ticket.
 * Todos are independent of projects.
 * Only shows todos assigned to the current user (unless ADMIN/MODERATOR).
 * For AGENTs: only shows todos if they have access to the ticket.
 */
export async function getTicketTodos(ticketId: string) {
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

  // For AGENTs, check if they have access to the ticket first
  if (user.role === "AGENT") {
    const hasAccess = await agentHasTicketAccess(user.id, ticketId);
    if (!hasAccess) {
      return [];
    }
    // Agent has access to ticket - show all todos for this ticket
  }

  // Build where clause based on user role
  const whereClause: any = { ticketId };
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    // Admins and moderators can see all todos for the ticket
    // No additional filter needed
  } else if (user.role === "AGENT") {
    // Agent has access to ticket - show all todos (already checked above)
    // No additional filter needed
  } else {
    // Regular users can only see todos assigned to them
    whereClause.assignedToId = user.id;
  }

  // Get todos linked to this ticket (todos are independent of projects)
  const todos = await prisma.todo.findMany({
    where: whereClause,
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      parentTodo: {
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
          dependsOnTodo: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      subtodos: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          subtodos: true,
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

  return todos.map((todo) => ({
    ...todo,
    actualHours: totalHours || null,
  }));
}

/**
 * Get all todos that the user can view.
 * Todos are completely independent of projects.
 * This is used for the standalone todos page.
 * Only shows todos assigned to the current user (unless ADMIN/MODERATOR).
 * For AGENTs: shows todos assigned to them OR linked to tickets they have access to.
 */
export async function getAllTodos(filters?: {
  status?: string;
  priority?: string;
  assignee?: "all" | "me" | "unassigned";
  link?: "all" | "withTicket" | "withoutTicket";
  kind?: "all" | "root" | "subtodo";
  sort?: string; // e.g. "createdAt-desc", "dueDate-asc"
}) {
  const user = await requireAuth();

  // Build where clause based on user role
  const whereClause: any = {};
  
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    // Admins and moderators can see all todos
    // No filter needed
  } else if (user.role === "AGENT") {
    // Agents can see todos assigned to them OR todos linked to tickets they have access to
    // We'll filter by assignment first, then filter by ticket access in memory
    whereClause.OR = [
      { assignedToId: user.id },
      { ticketId: { not: null } }, // Todos with tickets (we'll check access in memory)
    ];
  } else {
    // Regular users can only see todos assigned to them
    whereClause.assignedToId = user.id;
  }

  // Apply basic attribute filters
  if (filters?.status && filters.status !== "ALL") {
    whereClause.status = filters.status;
  }
  if (filters?.priority && filters.priority !== "ALL") {
    whereClause.priority = filters.priority;
  }

  // Handle assignee filter
  if (filters?.assignee === "me") {
    whereClause.assignedToId = user.id;
  } else if (filters?.assignee === "unassigned") {
    whereClause.assignedToId = null;
  }

  // Determine sort order
  const sortParam = filters?.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "dueDate", "asc" | "desc"];

  // Todos are independent - get todos filtered by assignment and filters
  const todos = await prisma.todo.findMany({
    where: whereClause,
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      parentTodo: {
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
          dependsOnTodo: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      subtodos: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          subtodos: true,
        },
      },
    },
    orderBy:
      sortBy === "dueDate"
        ? [
            { order: "asc" },
            { dueDate: sortOrder === "asc" ? "asc" : "desc" },
            { createdAt: "desc" },
          ]
        : [
            { order: "asc" },
            { createdAt: sortOrder === "asc" ? "asc" : "desc" },
          ],
  });

  // Calculate actual hours from time entries
  const ticketIds = todos.filter((t) => t.ticketId).map((t) => t.ticketId!);
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

  // For AGENTs, filter todos to only show those assigned to them OR linked to tickets they have access to
  let filteredTodos = todos;
  if (user.role === "AGENT") {
    const todoAccessChecks = await Promise.all(
      todos.map(async (todo) => {
        // If assigned to agent, always show
        if (todo.assignedToId === user.id) {
          return true;
        }
        // If linked to a ticket, check if agent has access to that ticket
        if (todo.ticketId) {
          return await agentHasTicketAccess(user.id, todo.ticketId);
        }
        // Todo not assigned and not linked to ticket - don't show
        return false;
      })
    );
    filteredTodos = todos.filter((_, index) => todoAccessChecks[index]);
  }

  // Apply link/kind filters in memory (useful even after permission filtering)
  filteredTodos = filteredTodos.filter((todo) => {
    // Link filter
    if (filters?.link === "withTicket" && !todo.ticketId) return false;
    if (filters?.link === "withoutTicket" && todo.ticketId) return false;

    // Kind filter
    if (filters?.kind === "root" && todo.parentTodoId) return false;
    if (filters?.kind === "subtodo" && !todo.parentTodoId) return false;

    return true;
  });

  return filteredTodos.map((todo) => ({
    ...todo,
    actualHours: todo.ticketId ? hoursByTicket.get(todo.ticketId) || 0 : null,
  }));
}

/**
 * Get a single todo by ID with all related data.
 * Todos are completely independent of projects.
 */
export async function getTodo(id: string) {
  const user = await requireAuth();

  const todo = await prisma.todo.findUnique({
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
      parentTodo: {
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
          dependsOnTodo: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      subtodos: {
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
          subtodos: true,
        },
      },
    },
  });

  if (!todo) {
    return null;
  }

  // Check if todos module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TODOS);
  if (!moduleEnabled) {
    return null;
  }

  // Check permissions - todos are independent, so we check general todo permissions
  // Admins, agents, and moderators can always view
  const { hasPermission } = await import("@/lib/utils/permissions");
  if (
    user.role !== "ADMIN" &&
    user.role !== "AGENT" &&
    user.role !== "MODERATOR" &&
    !(await hasPermission(user.id, "todos.view"))
  ) {
    return null;
  }

  // Check access based on role
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    // Admins and moderators can view all todos
  } else if (user.role === "AGENT") {
    // Agents can view todos if:
    // 1. Todo is assigned to them, OR
    // 2. Todo is linked to a ticket they have access to
    if (todo.assignedToId === user.id) {
      // Assigned to agent - allow access
    } else if (todo.ticketId) {
      // Check if agent has access to the ticket
      const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
      if (!hasAccess) {
        return null;
      }
    } else {
      // Todo not assigned and not linked to ticket - deny access
      return null;
    }
  } else {
    // Regular users can only view todos assigned to them
    if (!todo.assignedToId || todo.assignedToId !== user.id) {
      return null;
    }
  }

  // Calculate actual hours from time entries if todo is linked to a ticket
  let actualHours: number | null = null;
  if (todo.ticketId) {
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        ticketId: todo.ticketId,
        status: "COMPLETED",
      },
      select: {
        totalDuration: true,
      },
    });

    actualHours = timeEntries.reduce((sum, entry) => sum + entry.totalDuration / 3600, 0) || null;
  }

  // Get subtodo counts for each subtodo
  if (todo.subtodos && todo.subtodos.length > 0) {
    const subtodoIds = todo.subtodos.map((st) => st.id);
    const subtodoCounts = await prisma.todo.groupBy({
      by: ["parentTodoId"],
      where: {
        parentTodoId: {
          in: subtodoIds,
        },
      },
      _count: {
        id: true,
      },
    });

    const countMap = new Map(
      subtodoCounts.map((item) => [item.parentTodoId, item._count.id])
    );

    // Attach counts to subtodos
    todo.subtodos = todo.subtodos.map((subtodo) => ({
      ...subtodo,
      _count: {
        subtodos: countMap.get(subtodo.id) || 0,
      },
    }));
  }

  return {
    ...todo,
    actualHours,
  };
}
