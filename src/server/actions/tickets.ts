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
  assignedToGroupId?: string; // For assigning tickets to groups
  createdForUserId?: string; // For agents to create tickets for other users
  tags?: string[];
};

export type TicketUpdateInput = Partial<TicketInput> & {
  status?: "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "CANCELLED";
  assignedToGroupId?: string | null;
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

    // For agents, allow creating tickets for other users
    // For regular users, always use their own ID
    let createdById = user.id;
    
    if (user.role === "AGENT" && input.createdForUserId) {
      // Verify the user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: input.createdForUserId },
        select: { id: true, status: true },
      });
      
      if (!targetUser || targetUser.status === "DELETED") {
        return {
          success: false,
          error: "Selected user not found or inactive",
        };
      }
      
      createdById = input.createdForUserId;
    }

    // Handle "myself" for assignedToId - replace with current user's ID
    let assignedToId = input.assignedToId;
    if (assignedToId === "myself") {
      assignedToId = user.id;
    }

    // If assignedToId is provided, verify the agent exists and has appropriate role
    if (assignedToId) {
      const assignedAgent = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { id: true, role: true, status: true },
      });

      if (!assignedAgent || assignedAgent.status === "DELETED") {
        return {
          success: false,
          error: "Selected agent not found or inactive",
        };
      }

      // Verify the assigned user has a role that can be assigned tickets
      if (!["AGENT", "ADMIN", "MODERATOR"].includes(assignedAgent.role)) {
        return {
          success: false,
          error: "Selected user cannot be assigned tickets",
        };
      }
    }

    // Validate group assignment if provided
    if (input.assignedToGroupId) {
      const group = await prisma.group.findUnique({
        where: { id: input.assignedToGroupId },
      });
      if (!group) {
        return {
          success: false,
          error: "Selected group not found",
        };
      }
    }

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title: input.title.trim(),
        description: input.description?.trim(),
        type: ticketType,
        priority: input.priority || "MEDIUM",
        status: "OPEN",
        createdById,
        assignedToId: assignedToId || null,
        assignedToGroupId: input.assignedToGroupId || null,
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
  assignedToGroupId?: string;
  createdById?: string;
  createdFrom?: string; // ISO date string
  createdTo?: string; // ISO date string
  updatedFrom?: string; // ISO date string
  updatedTo?: string; // ISO date string
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}) {
  const user = await requireAuth();

  const where: any = {};

  // Build filter conditions first
  if (filters?.status) {
    // Handle special "UNRESOLVED" status filter
    if (filters.status === "UNRESOLVED") {
      where.status = {
        in: ["OPEN", "IN_PROGRESS", "PENDING"],
      };
    } else {
      where.status = filters.status;
    }
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
  if (filters?.assignedToGroupId) {
    where.assignedToGroupId = filters.assignedToGroupId;
  }
  if (filters?.createdById) {
    where.createdById = filters.createdById;
  }

  // Date filtering for created date
  if (filters?.createdFrom || filters?.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = new Date(filters.createdFrom);
    }
    if (filters.createdTo) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.createdTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  // Date filtering for updated date
  if (filters?.updatedFrom || filters?.updatedTo) {
    where.updatedAt = {};
    if (filters.updatedFrom) {
      where.updatedAt.gte = new Date(filters.updatedFrom);
    }
    if (filters.updatedTo) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.updatedTo);
      endDate.setHours(23, 59, 59, 999);
      where.updatedAt.lte = endDate;
    }
  }

  // For agents, apply group membership filter
  if (user.role === "AGENT") {
    // Get groups the agent is a member of
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const agentGroupIds = memberships.map((m) => m.groupId);

    // Agents can only see tickets that:
    // 1. Are not assigned to any group (assignedToGroupId is null), OR
    // 2. Are assigned to a group the agent is a member of
    const groupFilter = {
      OR: [
        { assignedToGroupId: null },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : []),
      ],
    };

    // Combine group filter with other filters using AND
    const otherFilters = { ...where };
    delete otherFilters.AND; // Remove AND if it exists
    
    where.AND = [
      groupFilter,
      ...(Object.keys(otherFilters).length > 0 ? [otherFilters] : []),
    ];
  }

  // Determine sort order
  const sortBy = filters?.sortBy || "createdAt";
  const sortOrder = filters?.sortOrder || "desc";

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
      assignedToGroup: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
  });
}

/**
 * Get a single ticket by ID
 */
export async function getTicket(id: string) {
  const user = await requireAuth();

  const ticket = await prisma.ticket.findUnique({
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
      assignedToGroup: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      comments: {
        where: {
          // Filter out agent-only comments for non-agents
          ...(user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR"
            ? { isAgentOnly: false }
            : {}),
        },
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

  if (!ticket) {
    return null;
  }

  // Check group access for agents
  if (user.role === "AGENT" && ticket.assignedToGroupId) {
    // Check if agent is a member of the ticket's group
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: user.id,
          groupId: ticket.assignedToGroupId,
        },
      },
    });

    if (!membership) {
      // Agent is not in the group, deny access
      return null;
    }
  }

  return ticket;
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
    if (input.assignedToGroupId !== undefined) {
      // Validate group if provided
      if (input.assignedToGroupId) {
        const group = await prisma.group.findUnique({
          where: { id: input.assignedToGroupId },
        });
        if (!group) {
          return {
            success: false,
            error: "Selected group not found",
          };
        }
      }
      updateData.assignedToGroupId = input.assignedToGroupId || null;
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
  content: string,
  isAgentOnly: boolean = false
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Comment cannot be empty",
      };
    }

    // Only agents, admins, and moderators can create agent-only comments
    if (isAgentOnly && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
      return {
        success: false,
        error: "Only agents can create agent-only comments",
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
        isAgentOnly,
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
