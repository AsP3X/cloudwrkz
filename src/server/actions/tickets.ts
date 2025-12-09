"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import {
  getTicketTypePrefix,
  generateTicketNumber,
  parseTicketNumber,
  type TicketType,
} from "@/lib/utils/tickets";
import { createTimeEntry } from "./time-tracking";
import { formatUserName } from "@/lib/utils/users";
import { logTicketActivity } from "../utils/ticket-activity-logger";

export type TicketInput = {
  title: string;
  description?: string;
  type?: "BUG" | "FEATURE" | "QUESTION" | "SUPPORT" | "TASK";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedToId?: string;
  assignedToGroupId?: string; // For assigning tickets to groups
  createdForUserId?: string; // For agents to create tickets for other users
  tags?: string[];
  createTimer?: boolean; // Create a timer for this ticket
};

export type TicketUpdateInput = Partial<TicketInput> & {
  status?: "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "CANCELLED";
  assignedToGroupId?: string | null;
  projectId?: string | null;
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

    // Check permission
    await requireAnyPermission("tickets.create");

    // Validate input
    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Title is required",
        fieldErrors: { title: ["Title cannot be empty"] },
      };
    }

    const ticketType: TicketType = input.type || "BUG";
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
        ticketNumber: true,
        title: true,
      },
    });

    // Log ticket creation
    await logTicketActivity(
      ticket.id,
      "CREATED",
      user.id,
      user.name || null
    );

    // Log assignment if assigned to agent
    if (assignedToId) {
      const assignedAgent = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: { name: true, email: true },
      });
      await logTicketActivity(
        ticket.id,
        "ASSIGNED_TO_AGENT",
        user.id,
        user.name || null,
        null,
        assignedAgent ? formatUserName(assignedAgent) : assignedToId,
        { agentId: assignedToId }
      );
    }

    // Log group assignment if assigned to group
    if (input.assignedToGroupId) {
      const group = await prisma.group.findUnique({
        where: { id: input.assignedToGroupId },
        select: { name: true },
      });
      await logTicketActivity(
        ticket.id,
        "ASSIGNED_TO_GROUP",
        user.id,
        user.name || null,
        null,
        group?.name || input.assignedToGroupId,
        { groupId: input.assignedToGroupId }
      );
    }

    // Create timer if requested and time tracking module is enabled
    if (input.createTimer) {
      const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
      if (timeTrackingEnabled) {
        // Count existing timers for this ticket to determine the number
        const existingTimerCount = await prisma.timeEntry.count({
          where: {
            ticketId: ticket.id,
          },
        });
        const timerNumber = existingTimerCount + 1;
        const timerName = `${ticket.ticketNumber} - ${ticket.title} - ${timerNumber}`;
        // Create timer for the current user (the one creating the ticket)
        await createTimeEntry({
          name: timerName,
          ticketId: ticket.id,
          description: `Timer for ticket ${ticket.ticketNumber}`,
        });
      }
    }

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/time-tracking");

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
  projectId?: string;
  projectIds?: string[]; // Array of project IDs for OR condition
  createdFrom?: string; // ISO date string
  createdTo?: string; // ISO date string
  updatedFrom?: string; // ISO date string
  updatedTo?: string; // ISO date string
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}) {
  const user = await requireAuth();
  
  // Check permission (admins always pass)
  try {
    await requireAnyPermission("tickets.view", "tickets.view_all", "admin.tickets.manage");
  } catch {
    // Fallback to role check for backward compatibility
    if (!["ADMIN", "MODERATOR", "AGENT", "USER"].includes(user.role)) {
      return [];
    }
  }

  const where: any = {};
  const baseFilters: any = {};

  // Build base filter conditions (status, priority, type, etc.)
  if (filters?.status) {
    // Handle special "UNRESOLVED" status filter
    if (filters.status === "UNRESOLVED") {
      baseFilters.status = {
        in: ["OPEN", "IN_PROGRESS", "PENDING"],
      };
    } else {
      baseFilters.status = filters.status;
    }
  }
  if (filters?.priority) {
    baseFilters.priority = filters.priority;
  }
  if (filters?.type) {
    baseFilters.type = filters.type;
  }
  if (filters?.assignedToId) {
    baseFilters.assignedToId = filters.assignedToId;
  }
  if (filters?.assignedToGroupId) {
    baseFilters.assignedToGroupId = filters.assignedToGroupId;
  }
  
  // Date filtering for created date
  if (filters?.createdFrom || filters?.createdTo) {
    baseFilters.createdAt = {};
    if (filters.createdFrom) {
      baseFilters.createdAt.gte = new Date(filters.createdFrom);
    }
    if (filters.createdTo) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.createdTo);
      endDate.setHours(23, 59, 59, 999);
      baseFilters.createdAt.lte = endDate;
    }
  }

  // Date filtering for updated date
  if (filters?.updatedFrom || filters?.updatedTo) {
    baseFilters.updatedAt = {};
    if (filters.updatedFrom) {
      baseFilters.updatedAt.gte = new Date(filters.updatedFrom);
    }
    if (filters.updatedTo) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.updatedTo);
      endDate.setHours(23, 59, 59, 999);
      baseFilters.updatedAt.lte = endDate;
    }
  }

  // Handle projectId filter (single project) - this takes precedence
  if (filters?.projectId) {
    baseFilters.projectId = filters.projectId;
  }
  
  // Support OR condition: tickets created by user OR tickets from their projects
  // This is used for project owners/managers to see all tickets for their projects
  if (filters?.projectIds && filters.projectIds.length > 0 && filters?.createdById && !filters?.projectId) {
    // Create an OR condition: tickets created by user OR tickets from their projects
    const orCondition = {
      OR: [
        { createdById: filters.createdById },
        { projectId: { in: filters.projectIds } },
      ],
    };
    
    // Combine OR condition with base filters using AND
    const andConditions: any[] = [orCondition];
    if (Object.keys(baseFilters).length > 0) {
      andConditions.push(baseFilters);
    }
    
    if (andConditions.length > 1) {
      where.AND = andConditions;
    } else {
      Object.assign(where, orCondition);
    }
  } else if (filters?.createdById && !filters?.projectId) {
    // Just filter by createdById if no projectIds
    baseFilters.createdById = filters.createdById;
    Object.assign(where, baseFilters);
  } else if (filters?.projectIds && filters.projectIds.length > 0 && !filters?.projectId) {
    // Just filter by projectIds if no createdById
    baseFilters.projectId = { in: filters.projectIds };
    Object.assign(where, baseFilters);
  } else {
    // No special OR condition, just use base filters
    Object.assign(where, baseFilters);
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
    // If where already has AND conditions, merge them
    if (where.AND) {
      where.AND = [groupFilter, ...where.AND];
    } else {
      const otherFilters = { ...where };
      delete otherFilters.AND; // Remove AND if it exists
      
      where.AND = [
        groupFilter,
        ...(Object.keys(otherFilters).length > 0 ? [otherFilters] : []),
      ];
    }
  }

  // Determine sort order
  const sortBy = filters?.sortBy || "createdAt";
  const sortOrder = filters?.sortOrder || "desc";

  return prisma.ticket.findMany({
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
      [sortBy]: sortOrder,
    },
  });
}

/**
 * Get a single ticket by ID
 */
export async function getTicket(id: string) {
  const user = await requireAuth();
  
  // Check permission (admins always pass)
  try {
    await requireAnyPermission("tickets.view", "tickets.view_all", "admin.tickets.manage");
  } catch {
    // Fallback to role check for backward compatibility
    if (!["ADMIN", "MODERATOR", "AGENT", "USER"].includes(user.role)) {
      return null;
    }
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
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
      projectId: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          color: true,
        },
      },
      comments: {
        where: {
          // Filter out agent-only comments for non-agents
          ...(user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR"
            ? { isAgentOnly: false }
            : {}),
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          isAgentOnly: true,
          userId: true,
          authorName: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      activities: {
        select: {
          id: true,
          activityType: true,
          changedById: true,
          changedByName: true,
          oldValue: true,
          newValue: true,
          metadata: true,
          createdAt: true,
          changedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
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
    
    // Check permission (admins always pass)
    try {
      await requireAnyPermission("tickets.update", "admin.tickets.manage");
    } catch {
      // Fallback to role check for backward compatibility
      if (!["ADMIN", "MODERATOR", "AGENT"].includes(user.role)) {
        return {
          success: false,
          error: "You don't have permission to update this ticket",
        };
      }
    }

    // Fetch current ticket data to compare changes
    const currentTicket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        createdById: true,
        assignedToId: true,
        assignedToGroupId: true,
        projectId: true,
        resolvedAt: true,
        closedAt: true,
        status: true,
        priority: true,
        type: true,
        title: true,
        description: true,
        tags: true,
      },
    });

    if (!currentTicket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Creator, assigned agent, admin, or moderator can update
    // Agents can update any ticket (to allow self-assignment and ticket management)
    const canUpdate = 
      currentTicket.createdById === user.id ||
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
    const userDisplayName = user.name || null;

    // Track status changes
    if (input.status !== undefined && input.status !== currentTicket.status) {
      updateData.status = input.status;
      
      // Set resolvedAt or closedAt based on status
      if (input.status === "RESOLVED" && !currentTicket.resolvedAt) {
        updateData.resolvedAt = new Date();
        await logTicketActivity(
          id,
          "RESOLVED",
          user.id,
          userDisplayName
        );
      } else if (input.status === "CLOSED" && !currentTicket.closedAt) {
        updateData.closedAt = new Date();
        await logTicketActivity(
          id,
          "CLOSED",
          user.id,
          userDisplayName
        );
      } else if (input.status === "OPEN" && (currentTicket.status === "RESOLVED" || currentTicket.status === "CLOSED")) {
        // Reopening a ticket
        await logTicketActivity(
          id,
          "REOPENED",
          user.id,
          userDisplayName,
          currentTicket.status,
          input.status
        );
      } else {
        // Regular status change
        await logTicketActivity(
          id,
          "STATUS_CHANGED",
          user.id,
          userDisplayName,
          currentTicket.status,
          input.status
        );
      }
    }

    // Track priority changes
    if (input.priority !== undefined && input.priority !== currentTicket.priority) {
      updateData.priority = input.priority;
      await logTicketActivity(
        id,
        "PRIORITY_CHANGED",
        user.id,
        userDisplayName,
        currentTicket.priority,
        input.priority
      );
    }

    // Track type changes
    if (input.type !== undefined && input.type !== currentTicket.type) {
      updateData.type = input.type;
      await logTicketActivity(
        id,
        "TYPE_CHANGED",
        user.id,
        userDisplayName,
        currentTicket.type,
        input.type
      );
    }

    // Track title changes
    if (input.title !== undefined && input.title.trim() !== currentTicket.title) {
      updateData.title = input.title.trim();
      await logTicketActivity(
        id,
        "TITLE_CHANGED",
        user.id,
        userDisplayName,
        currentTicket.title,
        input.title.trim()
      );
    }

    // Track description changes
    if (input.description !== undefined) {
      const newDescription = input.description?.trim() || null;
      const oldDescription = currentTicket.description || null;
      if (newDescription !== oldDescription) {
        updateData.description = newDescription;
        await logTicketActivity(
          id,
          "DESCRIPTION_CHANGED",
          user.id,
          userDisplayName,
          oldDescription || "(empty)",
          newDescription || "(empty)"
        );
      }
    }

    // Track assignment changes
    // Handle both explicit null (unassign) and undefined (no change)
    if (input.assignedToId !== undefined) {
      const newAssignedToId = input.assignedToId === "" ? null : (input.assignedToId || null);
      if (newAssignedToId !== currentTicket.assignedToId) {
        updateData.assignedToId = newAssignedToId;
        
        if (newAssignedToId && !currentTicket.assignedToId) {
          // Assigned to agent
          const assignedAgent = await prisma.user.findUnique({
            where: { id: newAssignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_AGENT",
            user.id,
            userDisplayName,
            null,
            assignedAgent ? formatUserName(assignedAgent) : newAssignedToId,
            { agentId: newAssignedToId }
          );
        } else if (!newAssignedToId && currentTicket.assignedToId) {
          // Unassigned from agent
          const oldAgent = await prisma.user.findUnique({
            where: { id: currentTicket.assignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            id,
            "UNASSIGNED_FROM_AGENT",
            user.id,
            userDisplayName,
            oldAgent ? formatUserName(oldAgent) : currentTicket.assignedToId,
            null,
            { agentId: currentTicket.assignedToId }
          );
        } else if (newAssignedToId && currentTicket.assignedToId) {
          // Reassigned to different agent
          const oldAgent = await prisma.user.findUnique({
            where: { id: currentTicket.assignedToId },
            select: { name: true, email: true },
          });
          const newAgent = await prisma.user.findUnique({
            where: { id: newAssignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_AGENT",
            user.id,
            userDisplayName,
            oldAgent ? formatUserName(oldAgent) : currentTicket.assignedToId,
            newAgent ? formatUserName(newAgent) : newAssignedToId,
            { oldAgentId: currentTicket.assignedToId, agentId: newAssignedToId }
          );
        }
      }
    }

    // Track group assignment changes
    if (input.assignedToGroupId !== undefined) {
      const newGroupId = input.assignedToGroupId || null;
      if (newGroupId !== currentTicket.assignedToGroupId) {
        // Validate group if provided
        if (newGroupId) {
          const group = await prisma.group.findUnique({
            where: { id: newGroupId },
          });
          if (!group) {
            return {
              success: false,
              error: "Selected group not found",
            };
          }
        }
        
        updateData.assignedToGroupId = newGroupId;
        
        if (newGroupId && !currentTicket.assignedToGroupId) {
          // Assigned to group
          const group = await prisma.group.findUnique({
            where: { id: newGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_GROUP",
            user.id,
            userDisplayName,
            null,
            group?.name || newGroupId,
            { groupId: newGroupId }
          );
        } else if (!newGroupId && currentTicket.assignedToGroupId) {
          // Unassigned from group
          const oldGroup = await prisma.group.findUnique({
            where: { id: currentTicket.assignedToGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            id,
            "UNASSIGNED_FROM_GROUP",
            user.id,
            userDisplayName,
            oldGroup?.name || currentTicket.assignedToGroupId,
            null,
            { groupId: currentTicket.assignedToGroupId }
          );
        } else if (newGroupId && currentTicket.assignedToGroupId) {
          // Reassigned to different group
          const oldGroup = await prisma.group.findUnique({
            where: { id: currentTicket.assignedToGroupId },
            select: { name: true },
          });
          const newGroup = await prisma.group.findUnique({
            where: { id: newGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_GROUP",
            user.id,
            userDisplayName,
            oldGroup?.name || currentTicket.assignedToGroupId,
            newGroup?.name || newGroupId,
            { oldGroupId: currentTicket.assignedToGroupId, groupId: newGroupId }
          );
        }
      }
    }

    // Track project assignment changes
    if (input.projectId !== undefined) {
      const newProjectId = input.projectId || null;
      if (newProjectId !== currentTicket.projectId) {
        // Validate project if provided and check user membership
        if (newProjectId) {
          const project = await prisma.project.findUnique({
            where: { id: newProjectId },
            select: { id: true, name: true },
          });
          if (!project) {
            return {
              success: false,
              error: "Selected project not found",
            };
          }

          // Check if user is a member of the project (for agents)
          if (user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") {
            const membership = await prisma.projectUser.findFirst({
              where: {
                projectId: newProjectId,
                userId: user.id,
              },
            });
            // Also check if user is creator or if user's groups are assigned
            const isCreator = await prisma.project.findFirst({
              where: {
                id: newProjectId,
                createdById: user.id,
              },
            });
            const userGroups = await prisma.groupMembership.findMany({
              where: { userId: user.id },
              select: { groupId: true },
            });
            const groupIds = userGroups.map((g) => g.groupId);
            const isInGroup = groupIds.length > 0 ? await prisma.projectGroup.findFirst({
              where: {
                projectId: newProjectId,
                groupId: { in: groupIds },
              },
            }) : null;

            if (!membership && !isCreator && !isInGroup) {
              return {
                success: false,
                error: "You must be a member of the project to assign tickets to it",
              };
            }
          }
        }

        updateData.projectId = newProjectId;
        
        if (newProjectId && !currentTicket.projectId) {
          // Assigned to project
          const project = await prisma.project.findUnique({
            where: { id: newProjectId },
            select: { name: true, code: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_PROJECT",
            user.id,
            userDisplayName,
            null,
            project ? `${project.name} (${project.code})` : newProjectId,
            { projectId: newProjectId }
          );
        } else if (!newProjectId && currentTicket.projectId) {
          // Unassigned from project
          const oldProject = await prisma.project.findUnique({
            where: { id: currentTicket.projectId },
            select: { name: true, code: true },
          });
          await logTicketActivity(
            id,
            "UNASSIGNED_FROM_PROJECT",
            user.id,
            userDisplayName,
            oldProject ? `${oldProject.name} (${oldProject.code})` : currentTicket.projectId,
            null,
            { projectId: currentTicket.projectId }
          );
        } else if (newProjectId && currentTicket.projectId) {
          // Reassigned to different project
          const oldProject = await prisma.project.findUnique({
            where: { id: currentTicket.projectId },
            select: { name: true, code: true },
          });
          const newProject = await prisma.project.findUnique({
            where: { id: newProjectId },
            select: { name: true, code: true },
          });
          await logTicketActivity(
            id,
            "ASSIGNED_TO_PROJECT",
            user.id,
            userDisplayName,
            oldProject ? `${oldProject.name} (${oldProject.code})` : currentTicket.projectId,
            newProject ? `${newProject.name} (${newProject.code})` : newProjectId,
            { oldProjectId: currentTicket.projectId, projectId: newProjectId }
          );
        }
      }
    }

    // Track tags changes
    if (input.tags !== undefined) {
      const oldTags = JSON.stringify(currentTicket.tags.sort());
      const newTags = JSON.stringify([...input.tags].sort());
      if (oldTags !== newTags) {
        updateData.tags = input.tags;
        await logTicketActivity(
          id,
          "TAGS_CHANGED",
          user.id,
          userDisplayName,
          currentTicket.tags.length > 0 ? currentTicket.tags.join(", ") : "(no tags)",
          input.tags.length > 0 ? input.tags.join(", ") : "(no tags)"
        );
      }
    }

    // Update the ticket
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
    
    // Check permission (admins always pass)
    try {
      await requireAnyPermission("tickets.delete", "admin.tickets.manage");
    } catch {
      // Fallback to role check for backward compatibility - continue with existing logic
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { createdById: true, assignedToId: true, projectId: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // For users with role USER, they can only delete if they are the project owner
    if (user.role === "USER") {
      if (!ticket.projectId) {
        return {
          success: false,
          error: "You don't have permission to delete this ticket",
        };
      }

      // Check if user is the owner of the project
      const project = await prisma.project.findUnique({
        where: { id: ticket.projectId },
        select: { createdById: true },
      });

      if (!project || project.createdById !== user.id) {
        return {
          success: false,
          error: "You don't have permission to delete this ticket. Only project owners can delete tickets.",
        };
      }
      // If USER is project owner, allow deletion (skip to deletion)
    } else {
      // For other roles: Creator, assigned agent, admin, or moderator can delete
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

    // Log comment activity
    await logTicketActivity(
      ticketId,
      "COMMENT_ADDED",
      user.id,
      user.name || null,
      null,
      null,
      { commentId: comment.id, isAgentOnly }
    );

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

/**
 * Bulk update tickets
 */
export async function bulkUpdateTickets(
  ticketIds: string[],
  updates: {
    status?: "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "CANCELLED";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    assignedToId?: string | null;
    assignedToGroupId?: string | null;
  }
): Promise<ActionResult<{ updated: number; failed: number }>> {
  try {
    const user = await requireAuth();

    if (!ticketIds || ticketIds.length === 0) {
      return {
        success: false,
        error: "No tickets selected",
      };
    }

    // Check permissions for all tickets and get current values for logging
    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: ticketIds },
      },
      select: {
        id: true,
        createdById: true,
        assignedToId: true,
        assignedToGroupId: true,
        resolvedAt: true,
        closedAt: true,
        status: true,
        priority: true,
      },
    });

    if (tickets.length === 0) {
      return {
        success: false,
        error: "No tickets found",
      };
    }

    // Verify user has permission to update all selected tickets
    // Creator, assigned agent, admin, or moderator can update
    const canUpdateAll = tickets.every(
      (ticket) =>
        ticket.createdById === user.id ||
        user.role === "ADMIN" ||
        user.role === "MODERATOR" ||
        user.role === "AGENT"
    );

    if (!canUpdateAll) {
      return {
        success: false,
        error: "You don't have permission to update all selected tickets",
      };
    }

    const updateData: any = {};
    const userDisplayName = user.name || null;

    // Log activities for each ticket before bulk update
    for (const ticket of tickets) {
      if (updates.status !== undefined && updates.status !== ticket.status) {
        if (updates.status === "RESOLVED" && !ticket.resolvedAt) {
          await logTicketActivity(
            ticket.id,
            "RESOLVED",
            user.id,
            userDisplayName
          );
        } else if (updates.status === "CLOSED" && !ticket.closedAt) {
          await logTicketActivity(
            ticket.id,
            "CLOSED",
            user.id,
            userDisplayName
          );
        } else if (updates.status === "OPEN" && (ticket.status === "RESOLVED" || ticket.status === "CLOSED")) {
          await logTicketActivity(
            ticket.id,
            "REOPENED",
            user.id,
            userDisplayName,
            ticket.status,
            updates.status
          );
        } else {
          await logTicketActivity(
            ticket.id,
            "STATUS_CHANGED",
            user.id,
            userDisplayName,
            ticket.status,
            updates.status
          );
        }
      }

      if (updates.priority !== undefined && updates.priority !== ticket.priority) {
        await logTicketActivity(
          ticket.id,
          "PRIORITY_CHANGED",
          user.id,
          userDisplayName,
          ticket.priority,
          updates.priority
        );
      }

      if (updates.assignedToId !== undefined && updates.assignedToId !== ticket.assignedToId) {
        const newAssignedToId = updates.assignedToId === "" ? null : (updates.assignedToId || null);
        if (newAssignedToId && !ticket.assignedToId) {
          // Assigned to agent
          const assignedAgent = await prisma.user.findUnique({
            where: { id: newAssignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            ticket.id,
            "ASSIGNED_TO_AGENT",
            user.id,
            userDisplayName,
            null,
            assignedAgent ? formatUserName(assignedAgent) : newAssignedToId,
            { agentId: newAssignedToId }
          );
        } else if (!newAssignedToId && ticket.assignedToId) {
          // Unassigned from agent
          const oldAgent = await prisma.user.findUnique({
            where: { id: ticket.assignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            ticket.id,
            "UNASSIGNED_FROM_AGENT",
            user.id,
            userDisplayName,
            oldAgent ? formatUserName(oldAgent) : ticket.assignedToId,
            null,
            { agentId: ticket.assignedToId }
          );
        } else if (newAssignedToId && ticket.assignedToId) {
          // Reassigned to different agent
          const oldAgent = await prisma.user.findUnique({
            where: { id: ticket.assignedToId },
            select: { name: true, email: true },
          });
          const newAgent = await prisma.user.findUnique({
            where: { id: newAssignedToId },
            select: { name: true, email: true },
          });
          await logTicketActivity(
            ticket.id,
            "ASSIGNED_TO_AGENT",
            user.id,
            userDisplayName,
            oldAgent ? formatUserName(oldAgent) : ticket.assignedToId,
            newAgent ? formatUserName(newAgent) : newAssignedToId,
            { oldAgentId: ticket.assignedToId, agentId: newAssignedToId }
          );
        }
      }

      if (updates.assignedToGroupId !== undefined && updates.assignedToGroupId !== ticket.assignedToGroupId) {
        const newGroupId = updates.assignedToGroupId === "" ? null : (updates.assignedToGroupId || null);
        if (newGroupId && !ticket.assignedToGroupId) {
          // Assigned to group
          const group = await prisma.group.findUnique({
            where: { id: newGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            ticket.id,
            "ASSIGNED_TO_GROUP",
            user.id,
            userDisplayName,
            null,
            group?.name || newGroupId,
            { groupId: newGroupId }
          );
        } else if (!newGroupId && ticket.assignedToGroupId) {
          // Unassigned from group
          const oldGroup = await prisma.group.findUnique({
            where: { id: ticket.assignedToGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            ticket.id,
            "UNASSIGNED_FROM_GROUP",
            user.id,
            userDisplayName,
            oldGroup?.name || ticket.assignedToGroupId,
            null,
            { groupId: ticket.assignedToGroupId }
          );
        } else if (newGroupId && ticket.assignedToGroupId) {
          // Reassigned to different group
          const oldGroup = await prisma.group.findUnique({
            where: { id: ticket.assignedToGroupId },
            select: { name: true },
          });
          const newGroup = await prisma.group.findUnique({
            where: { id: newGroupId },
            select: { name: true },
          });
          await logTicketActivity(
            ticket.id,
            "ASSIGNED_TO_GROUP",
            user.id,
            userDisplayName,
            oldGroup?.name || ticket.assignedToGroupId,
            newGroup?.name || newGroupId,
            { oldGroupId: ticket.assignedToGroupId, groupId: newGroupId }
          );
        }
      }
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set resolvedAt or closedAt based on status
      if (updates.status === "RESOLVED") {
        updateData.resolvedAt = new Date();
      }
      if (updates.status === "CLOSED") {
        updateData.closedAt = new Date();
      }
    }
    if (updates.priority !== undefined) {
      updateData.priority = updates.priority;
    }
    if (updates.assignedToId !== undefined) {
      updateData.assignedToId = updates.assignedToId === "" ? null : (updates.assignedToId || null);
    }
    if (updates.assignedToGroupId !== undefined) {
      updateData.assignedToGroupId = updates.assignedToGroupId === "" ? null : (updates.assignedToGroupId || null);
    }

    // Validate group if provided
    if (updates.assignedToGroupId) {
      const group = await prisma.group.findUnique({
        where: { id: updates.assignedToGroupId },
      });
      if (!group) {
        return {
          success: false,
          error: "Selected group not found",
        };
      }
    }

    const result = await prisma.ticket.updateMany({
      where: {
        id: { in: ticketIds },
      },
      data: updateData,
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        updated: result.count,
        failed: ticketIds.length - result.count,
      },
      message: `Successfully updated ${result.count} ticket${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk update tickets error:", error);
    return {
      success: false,
      error: "Failed to update tickets. Please try again.",
    };
  }
}

/**
 * Bulk delete tickets
 */
export async function bulkDeleteTickets(
  ticketIds: string[]
): Promise<ActionResult<{ deleted: number; failed: number }>> {
  try {
    const user = await requireAuth();

    if (!ticketIds || ticketIds.length === 0) {
      return {
        success: false,
        error: "No tickets selected",
      };
    }

    // Check permissions for all tickets
    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: ticketIds },
      },
      select: {
        id: true,
        createdById: true,
        assignedToId: true,
        projectId: true,
      },
    });

    if (tickets.length === 0) {
      return {
        success: false,
        error: "No tickets found",
      };
    }

    // For users with role USER, they can only delete if they are the project owner
    if (user.role === "USER") {
      // Get all unique project IDs from tickets
      const projectIds = tickets
        .map((t) => t.projectId)
        .filter((id): id is string => id !== null);

      if (projectIds.length === 0) {
        return {
          success: false,
          error: "You don't have permission to delete these tickets",
        };
      }

      // Check if user is the owner of all projects
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, createdById: true },
      });

      const userOwnedProjectIds = new Set(
        projects.filter((p) => p.createdById === user.id).map((p) => p.id)
      );

      // Verify user can delete all tickets
      const canDeleteAll = tickets.every((ticket) => {
        if (!ticket.projectId) {
          return false; // USER cannot delete tickets without a project
        }
        return userOwnedProjectIds.has(ticket.projectId);
      });

      if (!canDeleteAll) {
        return {
          success: false,
          error: "You don't have permission to delete all selected tickets. Only project owners can delete tickets.",
        };
      }
    } else {
      // Verify user has permission to delete all selected tickets
      // Creator, assigned agent (for assigned tickets), admin, or moderator can delete
      const canDeleteAll = tickets.every(
        (ticket) =>
          ticket.createdById === user.id ||
          user.role === "ADMIN" ||
          user.role === "MODERATOR" ||
          (user.role === "AGENT" && ticket.assignedToId === user.id)
      );

      if (!canDeleteAll) {
        return {
          success: false,
          error: "You don't have permission to delete all selected tickets",
        };
      }
    }

    const result = await prisma.ticket.deleteMany({
      where: {
        id: { in: ticketIds },
      },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        deleted: result.count,
        failed: ticketIds.length - result.count,
      },
      message: `Successfully deleted ${result.count} ticket${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk delete tickets error:", error);
    return {
      success: false,
      error: "Failed to delete tickets. Please try again.",
    };
  }
}
