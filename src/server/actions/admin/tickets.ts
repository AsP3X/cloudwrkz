"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type TicketFilters = {
  status?: string;
  priority?: string;
  type?: string;
  assignedToId?: string;
  createdById?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type TicketWithRelations = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdById: string | null;
  createdByName: string | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    status: string;
  } | null;
  assignedToId: string | null;
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
    status: string;
  } | null;
  assignedToGroupId: string | null;
  assignedToGroup: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  _count: {
    comments: number;
  };
};

/**
 * Get all tickets with filters (admin only)
 */
export async function getAllTicketsAdmin(filters: TicketFilters = {}) {
  await requireRole("ADMIN");

  const {
    status,
    priority,
    type,
    assignedToId,
    createdById,
    search,
    page = 1,
    limit = 50,
  } = filters;

  const skip = (page - 1) * limit;

  const where: any = {};

  if (status) {
    if (status === "UNRESOLVED") {
      where.status = {
        in: ["OPEN", "IN_PROGRESS", "PENDING"],
      };
    } else {
      where.status = status;
    }
  }

  if (priority) {
    where.priority = priority;
  }

  if (type) {
    where.type = type;
  }

  if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  if (createdById) {
    where.createdById = createdById;
  }

  if (search) {
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { createdByName: { contains: search, mode: "insensitive" } },
      {
        createdBy: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
      },
      {
        assignedTo: {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        description: true,
        type: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        createdById: true,
        createdByName: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        assignedToId: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        assignedToGroupId: true,
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
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Delete a ticket by ID (admin only)
 */
export async function deleteTicketAdmin(ticketId: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    await prisma.ticket.delete({
      where: { id: ticketId },
    });

    revalidatePath("/dashboard/admin/tickets");
    revalidatePath("/dashboard/tickets");

    return {
      success: true,
      message: "Ticket deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete ticket error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete ticket",
    };
  }
}

/**
 * Update ticket status (admin only)
 */
export async function updateTicketStatusAdmin(
  ticketId: string,
  status: string
): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    const updateData: any = {
      status,
    };

    // Set resolvedAt or closedAt based on status
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { resolvedAt: true, closedAt: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    if (status === "RESOLVED" && !ticket.resolvedAt) {
      updateData.resolvedAt = new Date();
    }
    if (status === "CLOSED" && !ticket.closedAt) {
      updateData.closedAt = new Date();
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    revalidatePath("/dashboard/admin/tickets");
    revalidatePath("/dashboard/tickets");

    return {
      success: true,
      message: "Ticket status updated successfully",
    };
  } catch (error: any) {
    console.error("Update ticket status error:", error);
    return {
      success: false,
      error: error.message || "Failed to update ticket status",
    };
  }
}
