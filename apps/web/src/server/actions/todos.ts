"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
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

/**
 * Checks whether a user has any todo-related permission.
 * Used as a coarse-grained gate before allowing access to todos.
 */
async function userHasAnyTodoPermission(userId: string): Promise<boolean> {
  const { hasPermission } = await import("@/lib/utils/permissions");

  return (
    (await hasPermission(userId, "todos.view")) ||
    (await hasPermission(userId, "todos.create")) ||
    (await hasPermission(userId, "todos.update")) ||
    (await hasPermission(userId, "todos.delete")) ||
    (await hasPermission(userId, "todos.assign"))
  );
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
  ticketId?: string;
  order?: number;
  dependencyIds?: string[]; // Todo IDs this todo depends on
};

export type TodoUpdateInput = Partial<TodoInput> & {
  completedDate?: Date | string | null;
  archivedAt?: Date | null;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Internal: create a todo as a given user. Caller must have validated permission.
 * Used by createTodo (session) and by API handler (bearer token).
 */
export async function createTodoWithUserId(
  userId: string,
  input: TodoInput
): Promise<ActionResult<{ id: string }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) {
    return { success: false, error: "User not found" };
  }
  return createTodoWithUser(user as { id: string; role: string }, input);
}

async function createTodoWithUser(
  user: { id: string; role: string },
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Forbidden") || errorMessage.includes("Missing")) {
      return {
        success: false,
        error: "You don't have permission to create todos. Please contact an administrator.",
      };
    }
    if (errorMessage.includes("not enabled")) {
      return { success: false, error: errorMessage };
    }
    if (errorMessage.includes("Unique constraint")) {
      return {
        success: false,
        error: "A todo with this information already exists.",
      };
    }
    if (errorMessage.includes("Foreign key constraint")) {
      return {
        success: false,
        error: "Invalid reference (user or ticket not found).",
      };
    }
    if (errorMessage.includes("Invalid value") || errorMessage.includes("Invalid enum")) {
      return {
        success: false,
        error: "Invalid data provided. Please check your input.",
      };
    }
    return {
      success: false,
      error: `Failed to create todo: ${errorMessage}`,
    };
  }
}

/**
 * Create a new todo (session auth). For API/bearer auth use createTodoWithUserId.
 */
export async function createTodo(
  input: TodoInput
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAnyPermission("todos.create");
  return createTodoWithUserId(user.id, input);
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
  input: Omit<TodoInput, "parentTodoId" | "ticketId">
): Promise<ActionResult<{ id: string }>> {
  try {
    // Reuse the same permission/module checks as createTodo
    const parent = await prisma.todo.findUnique({
      where: { id: parentTodoId },
      select: { id: true, ticketId: true },
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

/**
 * Update a todo with an explicit userId (for Bearer-token API handlers).
 */
export async function updateTodoWithUserId(
  userId: string,
  todoId: string,
  input: TodoUpdateInput
): Promise<ActionResult> {
  try {
    const canUpdate = await hasPermission(userId, "todos.update");
    if (!canUpdate) {
      return { success: false, error: "You do not have permission to update todos" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const todo = await prisma.todo.findUnique({
      where: { id: todoId },
      select: { parentTodoId: true, assignedToId: true, ticketId: true },
    });

    if (!todo) {
      return { success: false, error: "Todo not found" };
    }

    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // allow
    } else if (user.role === "AGENT") {
      if (todo.assignedToId === user.id) {
        // allow
      } else if (todo.ticketId) {
        const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
        if (!hasAccess) {
          return {
            success: false,
            error: "You can only update todos assigned to you or todos linked to tickets you have access to",
          };
        }
      } else {
        return {
          success: false,
          error: "You can only update todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      if (!todo.assignedToId || todo.assignedToId !== user.id) {
        return { success: false, error: "You can only update todos assigned to you" };
      }
    }

    if (input.parentTodoId && input.parentTodoId === todoId) {
      return { success: false, error: "A todo cannot be its own parent" };
    }

    if (input.parentTodoId) {
      const parentTodo = await prisma.todo.findUnique({
        where: { id: input.parentTodoId },
        select: { id: true },
      });
      if (!parentTodo) {
        return { success: false, error: "Parent todo not found" };
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

    if (input.assignedToId !== undefined && input.assignedToId !== todo.assignedToId) {
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
    if (input.ticketId !== undefined) updateData.ticketId = input.ticketId;
    if (input.order !== undefined) updateData.order = input.order;
    if (input.archivedAt !== undefined) updateData.archivedAt = input.archivedAt === null ? null : (input.archivedAt instanceof Date ? input.archivedAt : new Date(input.archivedAt));

    if (input.status === "COMPLETED" && !completedDate) {
      updateData.completedDate = new Date();
    }

    await prisma.todo.update({
      where: { id: todoId },
      data: updateData,
    });

    if (input.dependencyIds !== undefined) {
      await prisma.todoDependency.deleteMany({ where: { todoId } });
      if (input.dependencyIds.length > 0) {
        const dependencies = await prisma.todo.findMany({
          where: { id: { in: input.dependencyIds } },
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

    revalidatePath(`/dashboard/todos`);
    return { success: true, message: "Todo updated successfully" };
  } catch (error) {
    console.error("Error updating todo:", error);
    return { success: false, error: "Failed to update todo. Please try again." };
  }
}

export async function updateTodo(
  todoId: string,
  input: TodoUpdateInput
): Promise<ActionResult> {
  const user = await requireAuth();
  await requireAnyPermission("todos.update");
  return updateTodoWithUserId(user.id, todoId, input);
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

/**
 * Delete a todo with an explicit userId (for Bearer-token API handlers).
 */
export async function deleteTodoWithUserId(userId: string, todoId: string): Promise<ActionResult> {
  try {
    const canDelete = await hasPermission(userId, "todos.delete");
    if (!canDelete) {
      return { success: false, error: "You do not have permission to delete todos" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const todo = await prisma.todo.findUnique({
      where: { id: todoId },
      select: { id: true, assignedToId: true, ticketId: true },
    });

    if (!todo) {
      return { success: false, error: "Todo not found" };
    }

    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // allow
    } else if (user.role === "AGENT") {
      if (todo.assignedToId === user.id) {
        // allow
      } else if (todo.ticketId) {
        const hasAccess = await agentHasTicketAccess(user.id, todo.ticketId);
        if (!hasAccess) {
          return {
            success: false,
            error: "You can only delete todos assigned to you or todos linked to tickets you have access to",
          };
        }
      } else {
        return {
          success: false,
          error: "You can only delete todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      if (!todo.assignedToId || todo.assignedToId !== user.id) {
        return { success: false, error: "You can only delete todos assigned to you" };
      }
    }

    await prisma.$transaction(async (tx) => {
      const deleteTodoAndSubtodos = async (todoIdToDelete: string): Promise<void> => {
        const subtodos = await tx.todo.findMany({
          where: { parentTodoId: todoIdToDelete },
          select: { id: true },
        });
        for (const subtodo of subtodos) {
          await deleteTodoAndSubtodos(subtodo.id);
        }
        await tx.todo.delete({ where: { id: todoIdToDelete } });
      };
      await deleteTodoAndSubtodos(todoId);
    });

    revalidatePath(`/dashboard/todos`);
    return { success: true, message: "Todo deleted successfully" };
  } catch (error) {
    console.error("Error deleting todo:", error);
    return { success: false, error: "Failed to delete todo. Please try again." };
  }
}

export async function deleteTodo(todoId: string): Promise<ActionResult> {
  const user = await requireAuth();
  await requireAnyPermission("todos.delete");
  return deleteTodoWithUserId(user.id, todoId);
}

/**
 * Bulk update todos.
 *
 * Supports bulk status/priority changes from the overview page.
 */
export async function bulkUpdateTodos(
  todoIds: string[],
  updates: {
    status?: TodoStatus;
    priority?: TodoPriority;
  }
): Promise<ActionResult<{ updated: number; failed: number }>> {
  try {
    const user = await requireAuth();

    // Require explicit permission to update todos in bulk
    await requireAnyPermission("todos.update");

    if (!todoIds || todoIds.length === 0) {
      return {
        success: false,
        error: "No todos selected",
      };
    }

    if (updates.status === undefined && updates.priority === undefined) {
      return {
        success: false,
        error: "No updates provided",
      };
    }

    const todos = await prisma.todo.findMany({
      where: { id: { in: todoIds } },
      select: {
        id: true,
        assignedToId: true,
        ticketId: true,
        completedDate: true,
      },
    });

    if (todos.length === 0) {
      return {
        success: false,
        error: "No todos found",
      };
    }

    // Role-based access check for all selected todos
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // ok
    } else if (user.role === "AGENT") {
      const uniqueTicketIds = Array.from(
        new Set(todos.map((t) => t.ticketId).filter(Boolean) as string[])
      );
      const ticketAccess = new Map<string, boolean>();
      await Promise.all(
        uniqueTicketIds.map(async (ticketId) => {
          ticketAccess.set(ticketId, await agentHasTicketAccess(user.id, ticketId));
        })
      );

      const canUpdateAll = todos.every((t) => {
        if (t.assignedToId === user.id) return true;
        if (t.ticketId) return ticketAccess.get(t.ticketId) === true;
        return false;
      });

      if (!canUpdateAll) {
        return {
          success: false,
          error:
            "You can only update todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // USER
      const canUpdateAll = todos.every((t) => t.assignedToId === user.id);
      if (!canUpdateAll) {
        return {
          success: false,
          error: "You can only update todos assigned to you",
        };
      }
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const todo of todos) {
        const updateData: any = {};

        if (updates.status !== undefined) {
          updateData.status = updates.status;
          // Auto-set completedDate for newly completed todos (preserve existing completedDate)
          if (updates.status === "COMPLETED" && !todo.completedDate) {
            updateData.completedDate = now;
          }
        }
        if (updates.priority !== undefined) {
          updateData.priority = updates.priority;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.todo.update({
            where: { id: todo.id },
            data: updateData,
          });
        }
      }
    });

    // Todos are independent - only revalidate todos page
    revalidatePath("/dashboard/todos");

    return {
      success: true,
      data: {
        updated: todos.length,
        failed: todoIds.length - todos.length,
      },
      message: `Successfully updated ${todos.length} todo${todos.length !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk update todos error:", error);
    return {
      success: false,
      error: "Failed to update todos. Please try again.",
    };
  }
}

/**
 * Bulk archive todos.
 *
 * "Archive" in the UI means:
 * - Ensure status is COMPLETED
 * - Set completedDate if missing
 * - Set archivedAt (so it disappears from the overview)
 */
export async function bulkArchiveTodos(
  todoIds: string[]
): Promise<ActionResult<{ archived: number; failed: number }>> {
  try {
    const user = await requireAuth();

    // Require explicit permission to update/archive todos
    await requireAnyPermission("todos.update");

    if (!todoIds || todoIds.length === 0) {
      return {
        success: false,
        error: "No todos selected",
      };
    }

    const todos = await prisma.todo.findMany({
      where: { id: { in: todoIds } },
      select: {
        id: true,
        assignedToId: true,
        ticketId: true,
        completedDate: true,
      },
    });

    if (todos.length === 0) {
      return {
        success: false,
        error: "No todos found",
      };
    }

    // Role-based access check for all selected todos
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // ok
    } else if (user.role === "AGENT") {
      const uniqueTicketIds = Array.from(
        new Set(todos.map((t) => t.ticketId).filter(Boolean) as string[])
      );
      const ticketAccess = new Map<string, boolean>();
      await Promise.all(
        uniqueTicketIds.map(async (ticketId) => {
          ticketAccess.set(ticketId, await agentHasTicketAccess(user.id, ticketId));
        })
      );

      const canUpdateAll = todos.every((t) => {
        if (t.assignedToId === user.id) return true;
        if (t.ticketId) return ticketAccess.get(t.ticketId) === true;
        return false;
      });

      if (!canUpdateAll) {
        return {
          success: false,
          error:
            "You can only archive todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // USER
      const canUpdateAll = todos.every((t) => t.assignedToId === user.id);
      if (!canUpdateAll) {
        return {
          success: false,
          error: "You can only archive todos assigned to you",
        };
      }
    }

    const now = new Date();

    // Expand the archive set to include all descendant subtodos.
    // This ensures that when a parent todo is archived, its children (and nested children)
    // are archived as well.
    const rootIds = todos.map((t) => t.id);
    const idsToArchive = new Set<string>(rootIds);
    let frontier = [...rootIds];

    while (frontier.length > 0) {
      const children = await prisma.todo.findMany({
        where: { parentTodoId: { in: frontier } },
        select: { id: true },
      });

      const next: string[] = [];
      for (const child of children) {
        if (!idsToArchive.has(child.id)) {
          idsToArchive.add(child.id);
          next.push(child.id);
        }
      }
      frontier = next;
    }

    const allIds = Array.from(idsToArchive);
    const todosToArchive = await prisma.todo.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        completedDate: true,
        archivedAt: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const todo of todosToArchive) {
        await tx.todo.update({
          where: { id: todo.id },
          data: {
            status: "COMPLETED",
            // Preserve an existing archivedAt if already archived
            archivedAt: todo.archivedAt ?? now,
            completedDate: todo.completedDate ?? now,
          },
        });
      }
    });

    // Todos are independent - revalidate both overview and archive page
    revalidatePath("/dashboard/todos");
    revalidatePath("/dashboard/todos/archive");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        archived: todosToArchive.length,
        failed: todoIds.length - todos.length,
      },
      message: `Successfully archived ${todosToArchive.length} todo${todosToArchive.length !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk archive todos error:", error);
    return {
      success: false,
      error: "Failed to archive todos. Please try again.",
    };
  }
}

/**
 * Bulk unarchive todos.
 *
 * "Unarchive" means:
 * - Set archivedAt = null (so it reappears in the overview)
 * - Does NOT change status/completedDate automatically
 */
export async function bulkUnarchiveTodos(
  todoIds: string[]
): Promise<ActionResult<{ unarchived: number; failed: number }>> {
  try {
    const user = await requireAuth();

    if (!todoIds || todoIds.length === 0) {
      return { success: false, error: "No todos selected" };
    }

    const todos = await prisma.todo.findMany({
      where: { id: { in: todoIds } },
      select: {
        id: true,
        assignedToId: true,
        ticketId: true,
      },
    });

    if (todos.length === 0) {
      return { success: false, error: "No todos found" };
    }

    // Require explicit permission to update/archive todos
    await requireAnyPermission("todos.update");

    // Role-based access check for all selected todos (reuse logic from bulkArchiveTodos)
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // ok
    } else if (user.role === "AGENT") {
      const uniqueTicketIds = Array.from(
        new Set(todos.map((t) => t.ticketId).filter(Boolean) as string[])
      );
      const ticketAccess = new Map<string, boolean>();
      await Promise.all(
        uniqueTicketIds.map(async (ticketId) => {
          ticketAccess.set(ticketId, await agentHasTicketAccess(user.id, ticketId));
        })
      );

      const canUpdateAll = todos.every((t) => {
        if (t.assignedToId === user.id) return true;
        if (t.ticketId) return ticketAccess.get(t.ticketId) === true;
        return false;
      });

      if (!canUpdateAll) {
        return {
          success: false,
          error:
            "You can only unarchive todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // USER
      const canUpdateAll = todos.every((t) => t.assignedToId === user.id);
      if (!canUpdateAll) {
        return { success: false, error: "You can only unarchive todos assigned to you" };
      }
    }

    const result = await prisma.todo.updateMany({
      where: { id: { in: todoIds } },
      data: { archivedAt: null },
    });

    revalidatePath("/dashboard/todos");
    revalidatePath("/dashboard/todos/archive");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        unarchived: result.count,
        failed: todoIds.length - result.count,
      },
      message: `Successfully unarchived ${result.count} todo${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk unarchive todos error:", error);
    return { success: false, error: "Failed to unarchive todos. Please try again." };
  }
}

/**
 * Bulk delete todos (also deletes any nested subtodos).
 */
export async function bulkDeleteTodos(
  todoIds: string[]
): Promise<ActionResult<{ deleted: number; failed: number }>> {
  try {
    const user = await requireAuth();

    // Require explicit permission to delete todos in bulk
    await requireAnyPermission("todos.delete");

    if (!todoIds || todoIds.length === 0) {
      return {
        success: false,
        error: "No todos selected",
      };
    }

    const todos = await prisma.todo.findMany({
      where: { id: { in: todoIds } },
      select: {
        id: true,
        assignedToId: true,
        ticketId: true,
      },
    });

    if (todos.length === 0) {
      return {
        success: false,
        error: "No todos found",
      };
    }

    // Role-based access check for all selected todos
    if (user.role === "ADMIN" || user.role === "MODERATOR") {
      // ok
    } else if (user.role === "AGENT") {
      const uniqueTicketIds = Array.from(
        new Set(todos.map((t) => t.ticketId).filter(Boolean) as string[])
      );
      const ticketAccess = new Map<string, boolean>();
      await Promise.all(
        uniqueTicketIds.map(async (ticketId) => {
          ticketAccess.set(ticketId, await agentHasTicketAccess(user.id, ticketId));
        })
      );

      const canDeleteAll = todos.every((t) => {
        if (t.assignedToId === user.id) return true;
        if (t.ticketId) return ticketAccess.get(t.ticketId) === true;
        return false;
      });

      if (!canDeleteAll) {
        return {
          success: false,
          error:
            "You can only delete todos assigned to you or todos linked to tickets you have access to",
        };
      }
    } else {
      // USER
      const canDeleteAll = todos.every((t) => t.assignedToId === user.id);
      if (!canDeleteAll) {
        return {
          success: false,
          error: "You can only delete todos assigned to you",
        };
      }
    }

    const rootIds = todos.map((t) => t.id);

    const result = await prisma.$transaction(async (tx) => {
      const idsToDelete = new Set<string>(rootIds);
      let frontier = [...rootIds];

      while (frontier.length > 0) {
        const children = await tx.todo.findMany({
          where: { parentTodoId: { in: frontier } },
          select: { id: true },
        });

        const next: string[] = [];
        for (const child of children) {
          if (!idsToDelete.has(child.id)) {
            idsToDelete.add(child.id);
            next.push(child.id);
          }
        }
        frontier = next;
      }

      const allIds = Array.from(idsToDelete);
      const deleted = await tx.todo.deleteMany({
        where: { id: { in: allIds } },
      });

      return {
        deletedCount: deleted.count,
      };
    });

    // Todos are independent - revalidate todos and archive page
    revalidatePath("/dashboard/todos");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        deleted: result.deletedCount,
        failed: todoIds.length - todos.length,
      },
      message: `Successfully deleted ${result.deletedCount} todo${result.deletedCount !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk delete todos error:", error);
    return {
      success: false,
      error: "Failed to delete todos. Please try again.",
    };
  }
}


/**
 * Get all todos that are linked to a specific ticket.
 * Todos are independent of projects.
 * Only shows todos assigned to the current user (unless ADMIN/MODERATOR).
 * For AGENTs: only shows todos if they have access to the ticket.
 */
export async function getTicketTodos(ticketId: string) {
  const user = await requireAuth();

  // Coarse permission gate: require at least one todo-related permission
  if (!(await userHasAnyTodoPermission(user.id))) {
    return [];
  }

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
  const whereClause: any = { ticketId, archivedAt: null };
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
  archive?: "all" | "archived" | "unarchived";
  sort?: string; // e.g. "createdAt-desc", "dueDate-asc"
}) {
  const user = await requireAuth();

  // Coarse permission gate: require at least one todo-related permission
  if (!(await userHasAnyTodoPermission(user.id))) {
    return [];
  }

  // Build where clause based on user role
  const whereClause: any = {};
  // By default, hide archived todos from the overview
  const archiveMode = filters?.archive || "unarchived";
  if (archiveMode === "archived") {
    whereClause.archivedAt = { not: null };
  } else if (archiveMode === "unarchived") {
    whereClause.archivedAt = null;
  }
  
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

  // Coarse permission gate: require at least one todo-related permission
  if (!(await userHasAnyTodoPermission(user.id))) {
    return null;
  }

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
  await requireAnyPermission("todos.view");

  // Check access based on role and assignment/ticket access
  if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
    // Agents/admins/moderators can view todos if:
    // 1. Todo is assigned to them, OR
    // 2. Todo is linked to a ticket they have access to
    if (todo.assignedToId === user.id) {
      // Assigned to current user - allow access
    } else if (todo.ticketId) {
      // Check if user has access to the linked ticket (reuses agent ticket access logic)
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
