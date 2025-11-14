"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import {
  getTicketTypePrefix,
  generateTicketNumber,
  parseTicketNumber,
  type TicketType,
} from "@/lib/utils/tickets";

export type TicketInput = {
  title: string;
  description?: string;
  type?: "BUG" | "FEATURE" | "QUESTION" | "SUPPORT" | "TASK";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedToId?: string;
  tags?: string[];
};

export type TicketUpdateInput = Partial<TicketInput> & {
  status?: "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "CANCELLED";
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Create a new ticket
 */
export async function createTicket(input: TicketInput): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if tickets module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Tickets module is not enabled",
      };
    }

    const user = await requireAuth();

    // Validate input
    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Title is required",
        fieldErrors: { title: ["Title cannot be empty"] },
      };
    }

    const ticketType: TicketType = input.type || "SUPPORT";
    const prefix = getTicketTypePrefix(ticketType);

    // Find the highest sequence number for this prefix
    const existingTickets = await prisma.ticket.findMany({
      where: {
        ticketNumber: {
          startsWith: `#${prefix}-`,
        },
      },
      select: {
        ticketNumber: true,
      },
      orderBy: {
        ticketNumber: "desc",
      },
      take: 1,
    });

    let nextSequence = 1;
    if (existingTickets.length > 0) {
      const parsed = parseTicketNumber(existingTickets[0].ticketNumber);
      if (parsed) {
        nextSequence = parsed.sequence + 1;
      }
    }

    const ticketNumber = generateTicketNumber(prefix, nextSequence);

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title: input.title.trim(),
        description: input.description?.trim(),
        type: ticketType,
        priority: input.priority || "MEDIUM",
        status: "OPEN",
        createdById: user.id,
        assignedToId: input.assignedToId,
        tags: input.tags || [],
      },
      select: {
        id: true,
      },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: { id: ticket.id },
      message: "Ticket created successfully",
    };
  } catch (error) {
    console.error("Create ticket error:", error);
    return {
      success: false,
      error: "Failed to create ticket. Please try again.",
    };
  }
}

/**
 * Get all tickets (with filters)
 */
export async function getTickets(filters?: {
  status?: string;
  priority?: string;
  type?: string;
  assignedToId?: string;
  createdById?: string;
}) {
  const user = await requireAuth();

  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.priority) {
    where.priority = filters.priority;
  }
  if (filters?.type) {
    where.type = filters.type;
  }
  if (filters?.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }
  if (filters?.createdById) {
    where.createdById = filters.createdById;
  }

  return prisma.ticket.findMany({
    where,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get a single ticket by ID
 */
export async function getTicket(id: string) {
  await requireAuth();

  return prisma.ticket.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      comments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

/**
 * Update a ticket
 */
export async function updateTicket(
  id: string,
  input: TicketUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { createdById: true, assignedToId: true, resolvedAt: true, closedAt: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Creator, assigned agent, admin, or moderator can update
    // Agents can update any ticket (to allow self-assignment and ticket management)
    const canUpdate = 
      ticket.createdById === user.id ||
      user.role === "ADMIN" ||
      user.role === "MODERATOR" ||
      user.role === "AGENT"; // Agents can update all tickets
    
    if (!canUpdate) {
      return {
        success: false,
        error: "You don't have permission to update this ticket",
      };
    }

    const updateData: any = {};

    if (input.title !== undefined) {
      updateData.title = input.title.trim();
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim();
    }
    if (input.type !== undefined) {
      updateData.type = input.type;
    }
    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
      
      // Set resolvedAt or closedAt based on status
      if (input.status === "RESOLVED" && !ticket.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
      if (input.status === "CLOSED" && !ticket.closedAt) {
        updateData.closedAt = new Date();
      }
    }
    if (input.assignedToId !== undefined) {
      updateData.assignedToId = input.assignedToId || null;
    }
    if (input.tags !== undefined) {
      updateData.tags = input.tags;
    }

    await prisma.ticket.update({
      where: { id },
      data: updateData,
    });

    revalidatePath(`/dashboard/tickets/${id}`);
    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Ticket updated successfully",
    };
  } catch (error) {
    console.error("Update ticket error:", error);
    return {
      success: false,
      error: "Failed to update ticket. Please try again.",
    };
  }
}

/**
 * Delete a ticket
 */
export async function deleteTicket(id: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { createdById: true, assignedToId: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Creator, assigned agent, admin, or moderator can delete
    const canDelete = 
      ticket.createdById === user.id ||
      user.role === "ADMIN" ||
      user.role === "MODERATOR" ||
      (user.role === "AGENT" && ticket.assignedToId === user.id);
    
    if (!canDelete) {
      return {
        success: false,
        error: "You don't have permission to delete this ticket",
      };
    }

    await prisma.ticket.delete({
      where: { id },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Ticket deleted successfully",
    };
  } catch (error) {
    console.error("Delete ticket error:", error);
    return {
      success: false,
      error: "Failed to delete ticket. Please try again.",
    };
  }
}

/**
 * Add a comment to a ticket
 */
export async function addTicketComment(
  ticketId: string,
  content: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Comment cannot be empty",
      };
    }

    // Verify ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        userId: user.id,
        content: content.trim(),
      },
      select: {
        id: true,
      },
    });

    revalidatePath(`/dashboard/tickets/${ticketId}`);

    return {
      success: true,
      data: { id: comment.id },
      message: "Comment added successfully",
    };
  } catch (error) {
    console.error("Add comment error:", error);
    return {
      success: false,
      error: "Failed to add comment. Please try again.",
    };
  }
}
