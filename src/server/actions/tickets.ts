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
import { hasTicketPermission } from "@/lib/utils/permissions";
import { sanitizeHtml, extractPlainText } from "@/lib/utils/rich-text";

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

    // Process description: sanitize HTML and extract plain text
    const descriptionHtml = input.description 
      ? sanitizeHtml(input.description) 
      : null;
    const descriptionPlain = descriptionHtml 
      ? extractPlainText(descriptionHtml) 
      : null;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        title: input.title.trim(),
        description: descriptionPlain, // Keep legacy field for backward compatibility
        descriptionHtml,
        descriptionPlain,
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
        // Generate a proper TMR number for the timer
        // Find the highest sequence number for #TMR- or TMR- prefix
        const { parseTimerNumber, generateTimerNumber } = await import("@/lib/utils/time-tracking");
        const existingTimers = await prisma.timeEntry.findMany({
          where: {
            OR: [
              { name: { startsWith: "#TMR-" } },
              { name: { startsWith: "TMR-" } },
            ],
          },
          select: {
            name: true,
          },
          orderBy: {
            name: "desc",
          },
          take: 1,
        });

        let nextSequence = 1;
        if (existingTimers.length > 0) {
          const parsed = parseTimerNumber(existingTimers[0].name);
          if (parsed) {
            nextSequence = parsed.sequence + 1;
          }
        }
        const timerName = generateTimerNumber(nextSequence);
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
  createdFrom?: string; // ISO date string
  createdTo?: string; // ISO date string
  updatedFrom?: string; // ISO date string
  updatedTo?: string; // ISO date string
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  archive?: "all" | "archived" | "unarchived";
}) {
  const user = await requireAuth();
  
  // Check permission
  const { getUserPermissions, parseTicketPermissionKey } = await import("@/lib/utils/permissions");
  const userPermissions = await getUserPermissions(user.id);
  
  // Check if user has any dynamic ticket view permissions
  let hasDynamicViewPermissions = false;
  for (const permissionKey of userPermissions) {
    const parsed = parseTicketPermissionKey(permissionKey);
    if (parsed && parsed.action === "view") {
      hasDynamicViewPermissions = true;
      break;
    }
  }
  
  const canViewAllTickets = userPermissions.has("tickets.view_all") || userPermissions.has("admin.tickets.manage");
  const canViewTickets = userPermissions.has("tickets.view") || canViewAllTickets || hasDynamicViewPermissions;

  if (!canViewTickets) {
    // User has no permission to view tickets (neither general nor dynamic)
    return [];
  }

  // Extract ticket IDs from dynamic "view" permissions FIRST
  // This is important because we need to know if user has dynamic permissions
  // before applying base filters that might conflict (like createdById)
  const dynamicTicketIds: string[] = [];
  for (const permissionKey of userPermissions) {
    const parsed = parseTicketPermissionKey(permissionKey);
    if (parsed && parsed.action === "view") {
      dynamicTicketIds.push(parsed.ticketId);
      if (process.env.NODE_ENV === "development") {
        console.log(`[getTickets] Found dynamic view permission for ticket: ${parsed.ticketId} (prefix: ${parsed.prefix})`);
      }
    }
  }
  
  const hasDynamicPermissions = dynamicTicketIds.length > 0;
  if (process.env.NODE_ENV === "development") {
    console.log(`[getTickets] User ${user.id} (role: ${user.role}) has ${dynamicTicketIds.length} dynamic ticket permissions:`, dynamicTicketIds);
    console.log(`[getTickets] canViewAllTickets: ${canViewAllTickets}, canViewTickets: ${canViewTickets}`);
  }

  const where: any = {};
  const baseFilters: any = {};

  // Archive filtering (default: hide archived tickets)
  const archiveMode = filters?.archive ?? "unarchived";
  if (archiveMode === "archived") {
    baseFilters.archivedAt = { not: null };
  } else if (archiveMode === "unarchived") {
    baseFilters.archivedAt = null;
  }

  // Build base filter conditions (status, priority, type, etc.)
  //
  // Special values:
  // - "UNRESOLVED": maps to OPEN / IN_PROGRESS / PENDING
  // - "ALL": means "no status filter" and is ignored here
  if (filters?.status && filters.status !== "ALL") {
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

  // Apply createdById filter if provided
  if (filters?.createdById) {
    // Only apply createdById filter if user doesn't have dynamic permissions
    // OR if we're in view_all mode (where it doesn't matter)
    // Dynamic permissions will be handled in the permission filter section below
    // and should allow access regardless of who created the ticket
    if (!hasDynamicPermissions || canViewAllTickets) {
      baseFilters.createdById = filters.createdById;
      Object.assign(where, baseFilters);
    } else {
      // User has dynamic permissions, so don't apply createdById as a base filter
      // It will be included in the permission filter OR condition instead
      Object.assign(where, baseFilters);
    }
  } else {
    // No special condition, just use base filters
    Object.assign(where, baseFilters);
  }

  // Apply permission-based filtering
  if (!canViewAllTickets) {
    // User can only view specific tickets
    const permissionFilters: any[] = [];
    
    // Add tickets with dynamic permissions (highest priority - these override other filters)
    if (dynamicTicketIds.length > 0) {
      permissionFilters.push({ id: { in: dynamicTicketIds } });
      if (process.env.NODE_ENV === "development") {
        console.log(`[getTickets] Adding dynamic ticket filter for IDs:`, dynamicTicketIds);
      }
    }
    
    if (user.role === "AGENT") {
      // Agents can see tickets assigned to them or their groups
      const memberships = await prisma.groupMembership.findMany({
        where: { userId: user.id },
        select: { groupId: true },
      });
      const agentGroupIds = memberships.map((m) => m.groupId);

      // Agents can only see:
      // 1. Tickets assigned to them directly (assignedToId === user.id)
      // 2. Tickets assigned to their groups (assignedToGroupId IN agentGroupIds)
      // They should NOT see tickets with no group assignment unless assigned to them
      permissionFilters.push(
        { assignedToId: user.id },
        ...(agentGroupIds.length > 0 ? [{ assignedToGroupId: { in: agentGroupIds } }] : [])
      );
    } else if (user.role === "USER") {
      // Regular users can ALWAYS see tickets they created, regardless of dynamic permissions
      // This is a fundamental access right - ticket creators should always have access
      // We add this to the OR condition so tickets created by the user are always included
      permissionFilters.push({ createdById: user.id });
    }

    // If we have permission filters, combine them with OR
    if (permissionFilters.length > 0) {
      const permissionFilter = {
        OR: permissionFilters,
      };

      if (process.env.NODE_ENV === "development") {
        console.log(`[getTickets] Permission filter:`, JSON.stringify(permissionFilter, null, 2));
        console.log(`[getTickets] Current where clause before combining:`, JSON.stringify(where, null, 2));
      }

      // IMPORTANT: For users with dynamic permissions, we need to ensure the permission filter
      // takes precedence. The permission filter should allow tickets that match ANY of the 
      // permission conditions AND also match the base filters (status, priority, type, etc.)
      // 
      // We've already ensured that createdById is not in baseFilters when the user has
      // dynamic permissions (see lines 418-430), so we just need to combine the filters correctly.
      
      if (where.AND) {
        // If where already has AND conditions, add permission filter to the AND array
        where.AND = [permissionFilter, ...where.AND];
      } else if (Object.keys(where).length > 0) {
        // If where has other filters, combine them with AND
        const otherFilters = { ...where };
        where.AND = [permissionFilter, otherFilters];
      } else {
        // No other filters, just use permission filter
        Object.assign(where, permissionFilter);
      }

      if (process.env.NODE_ENV === "development") {
        console.log(`[getTickets] Final where clause:`, JSON.stringify(where, null, 2));
      }
    }
  } else if (dynamicTicketIds.length > 0) {
    // Even if user has view_all, we might want to include dynamic permissions
    // But actually, view_all means they can see everything, so we don't need to filter
    // This is just here for clarity - we don't need to do anything
  }
  // Users with view_all permission can see all tickets (no additional filter)

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
        descriptionHtml: true,
        descriptionPlain: true,
        type: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        archivedAt: true,
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

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
      descriptionHtml: true,
      descriptionPlain: true,
      type: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      archivedAt: true,
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
          contentHtml: true,
          contentPlain: true,
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

  // Check dynamic ticket permission or general permissions
  // Admins always have access
  if (user.role !== "ADMIN") {
    // Get ticket type prefix
    const { getTicketTypePrefix } = await import("@/lib/utils/tickets");
    const ticketPrefix = getTicketTypePrefix(ticket.type);
    
    // Debug logging
    if (process.env.NODE_ENV === "development") {
      console.log(`[getTicket] Checking access for user ${user.id}, ticket ${ticket.id}, type ${ticket.type}, prefix ${ticketPrefix}`);
    }
    
    // Check permissions - we need to check both dynamic and general permissions
    const { getUserPermissions, generateTicketPermissionKey } = await import("@/lib/utils/permissions");
    const userPermissions = await getUserPermissions(user.id);
    const dynamicKey = generateTicketPermissionKey(ticket.id, ticketPrefix, "view");
    
    // Check if user has the specific dynamic permission for this ticket
    const hasSpecificDynamicPermission = userPermissions.has(dynamicKey);
    
    // Check if user has general ticket viewing permissions
    const hasGeneralViewPermission = userPermissions.has("tickets.view") || 
                                     userPermissions.has("tickets.view_all") || 
                                     userPermissions.has("admin.tickets.manage");
    
    // Check if a dynamic permission was ever created for this ticket
    // If it was, we need to require it specifically (even if user has general permissions)
    const dynamicPermissionExists = await prisma.permission.findUnique({
      where: { key: dynamicKey },
      select: { id: true },
    });
    
    if (process.env.NODE_ENV === "development") {
      console.log(`[getTicket] Checking access for user ${user.id}, ticket ${ticket.id}`);
      console.log(`[getTicket] Dynamic key: ${dynamicKey}`);
      console.log(`[getTicket] Has specific dynamic permission: ${hasSpecificDynamicPermission}`);
      console.log(`[getTicket] Has general view permission: ${hasGeneralViewPermission}`);
      console.log(`[getTicket] Dynamic permission exists in DB: ${!!dynamicPermissionExists}`);
      const ticketPerms = Array.from(userPermissions).filter(p => p.includes("tickets"));
      console.log(`[getTicket] All ticket permissions:`, ticketPerms);
    }
    
    // IMPORTANT: Ticket creators should ALWAYS have access to their own tickets,
    // regardless of dynamic permissions. This is a fundamental access right.
    // 
    // If a dynamic permission was ever created for this ticket,
    // we require it specifically for other users. General permissions alone are not enough
    // if a dynamic permission was created and then removed from the user's group.
    //
    // If no dynamic permission was ever created for this ticket,
    // general permissions should still work (backward compatibility).
    
    // First, check if user created the ticket - creators always have access
    const isCreator = ticket.createdById === user.id;
    
    let hasAccess = false;
    if (isCreator) {
      // User created the ticket - always allow access
      hasAccess = true;
      if (process.env.NODE_ENV === "development") {
        console.log(`[getTicket] User ${user.id} created this ticket - allowing access`);
      }
    } else if (dynamicPermissionExists) {
      // Dynamic permission exists - require it specifically
      hasAccess = hasSpecificDynamicPermission;
      if (process.env.NODE_ENV === "development") {
        console.log(`[getTicket] Dynamic permission exists for this ticket - requiring specific permission: ${hasAccess}`);
      }
    } else {
      // No dynamic permission exists - general permissions are sufficient
      hasAccess = hasSpecificDynamicPermission || hasGeneralViewPermission;
      if (process.env.NODE_ENV === "development") {
        console.log(`[getTicket] No dynamic permission exists - allowing general permissions: ${hasAccess}`);
      }
    }
    
    if (!hasAccess) {
      // For agents, check if they have access through assignment or group membership
      if (user.role === "AGENT") {
        // Check if ticket is assigned to the agent directly
        if (ticket.assignedToId === user.id) {
          if (process.env.NODE_ENV === "development") {
            console.log(`[getTicket] Agent ${user.id} has access - ticket is assigned to them directly`);
          }
          // Allow access - ticket is assigned to agent (continue to return ticket)
          hasAccess = true;
        } else if (ticket.assignedToGroupId) {
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
            // Agent is not in the group and ticket is not assigned to them, deny access
            if (process.env.NODE_ENV === "development") {
              console.log(`[getTicket] Agent ${user.id} is not assigned to ticket and not a member of group ${ticket.assignedToGroupId}, denying access`);
            }
            return null;
          }
          // Agent is in the group, allow access
          if (process.env.NODE_ENV === "development") {
            console.log(`[getTicket] Agent ${user.id} has access - is a member of group ${ticket.assignedToGroupId}`);
          }
          hasAccess = true;
        } else {
          // Ticket is not assigned to agent and has no group assignment, deny access
          if (process.env.NODE_ENV === "development") {
            console.log(`[getTicket] Agent ${user.id} has no access - ticket is not assigned to them and has no group assignment`);
          }
          return null;
        }
      } else {
        // No permission and not an agent, deny
        if (process.env.NODE_ENV === "development") {
          console.log(`[getTicket] User ${user.id} (role: ${user.role}) has no permission and no agent access, denying access`);
        }
        return null;
      }
    }
    
    if (process.env.NODE_ENV === "development") {
      if (hasAccess) {
        console.log(`[getTicket] User ${user.id} has access (dynamic: ${hasSpecificDynamicPermission}, general: ${hasGeneralViewPermission}, agent assignment: ${user.role === "AGENT" && (ticket.assignedToId === user.id || ticket.assignedToGroupId)}), allowing access`);
      }
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
        id: true,
        createdById: true,
        assignedToId: true,
        assignedToGroupId: true,
        resolvedAt: true,
        closedAt: true,
        status: true,
        priority: true,
        type: true,
        title: true,
        description: true,
        descriptionHtml: true,
        descriptionPlain: true,
        tags: true,
        ticketNumber: true,
      },
    });

    if (!currentTicket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Check dynamic ticket permission or general permissions
    // Admins always have access
    let canUpdate = user.role === "ADMIN";
    
    if (!canUpdate) {
      // Get ticket type prefix
      const ticketPrefix = getTicketTypePrefix(currentTicket.type);
      // Check dynamic ticket permission
      canUpdate = await hasTicketPermission(user.id, currentTicket.id, ticketPrefix, "update");
      
      // Fallback to general permission or role-based access
      if (!canUpdate) {
        canUpdate = 
          currentTicket.createdById === user.id ||
          user.role === "MODERATOR" ||
          user.role === "AGENT"; // Agents can update all tickets (if they have general permission)
      }
    }
    
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
      const descriptionHtml = input.description 
        ? sanitizeHtml(input.description) 
        : null;
      const descriptionPlain = descriptionHtml 
        ? extractPlainText(descriptionHtml) 
        : null;
      
      const oldDescription = currentTicket.description || null;
      if (descriptionPlain !== oldDescription) {
        updateData.description = descriptionPlain; // Keep legacy field
        updateData.descriptionHtml = descriptionHtml;
        updateData.descriptionPlain = descriptionPlain;
        await logTicketActivity(
          id,
          "DESCRIPTION_CHANGED",
          user.id,
          userDisplayName,
          oldDescription || "(empty)",
          descriptionPlain || "(empty)"
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
      select: { 
        id: true,
        createdById: true, 
        assignedToId: true, 
        ticketNumber: true,
        type: true,
      },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Check dynamic ticket permission or general permissions
    // Admins always have access
    let canDelete = user.role === "ADMIN";
    
    if (!canDelete) {
      // Get ticket type prefix
      const ticketPrefix = getTicketTypePrefix(ticket.type);
      // Check dynamic ticket permission
      canDelete = await hasTicketPermission(user.id, ticket.id, ticketPrefix, "delete");
      
      // Fallback to role-based access
      if (!canDelete) {
        // For other roles: Creator, assigned agent, admin, or moderator can delete
        canDelete = 
          ticket.createdById === user.id ||
          user.role === "MODERATOR" ||
          (user.role === "AGENT" && ticket.assignedToId === user.id);
      }
    }
    
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

    // Verify ticket exists and check permission
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, ticketNumber: true },
    });

    if (!ticket) {
      return {
        success: false,
        error: "Ticket not found",
      };
    }

    // Check dynamic ticket permission or general permissions
    // Admins always have access
    if (user.role !== "ADMIN") {
      // Get ticket type to determine prefix
      const fullTicket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, type: true },
      });
      
      if (fullTicket) {
        const ticketPrefix = getTicketTypePrefix(fullTicket.type);
        const hasPermission = await hasTicketPermission(
          user.id,
          fullTicket.id,
          ticketPrefix,
          "comment"
        );
        
        if (!hasPermission) {
          // Fallback to general permission check
          try {
            await requireAnyPermission("tickets.comment");
          } catch {
            return {
              success: false,
              error: "You don't have permission to comment on this ticket",
            };
          }
        }
      } else {
        // Ticket not found, fallback to general permission check
        try {
          await requireAnyPermission("tickets.comment");
        } catch {
          return {
            success: false,
            error: "You don't have permission to comment on this ticket",
          };
        }
      }
    }

    // Process comment: sanitize HTML and extract plain text
    const contentHtml = sanitizeHtml(content);
    const contentPlain = extractPlainText(contentHtml);

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId,
        userId: user.id,
        content: contentPlain, // Keep legacy field for backward compatibility
        contentHtml,
        contentPlain,
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
      },
    });

    if (tickets.length === 0) {
      return {
        success: false,
        error: "No tickets found",
      };
    }

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

    const result = await prisma.ticket.deleteMany({
      where: {
        id: { in: ticketIds },
      },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/archive");

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

/**
 * Bulk archive tickets.
 *
 * "Archive" means:
 * - Set archivedAt so the ticket is hidden from default lists/search.
 * - Does NOT change status (unlike todos).
 */
export async function bulkArchiveTickets(
  ticketIds: string[]
): Promise<ActionResult<{ archived: number; failed: number }>> {
  try {
    const user = await requireAuth();

    if (!ticketIds || ticketIds.length === 0) {
      return { success: false, error: "No tickets selected" };
    }

    // Check permissions for all tickets (same broad rule as bulkUpdateTickets)
    const tickets = await prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, createdById: true },
    });

    if (tickets.length === 0) {
      return { success: false, error: "No tickets found" };
    }

    const canUpdateAll = tickets.every(
      (t) =>
        t.createdById === user.id ||
        user.role === "ADMIN" ||
        user.role === "MODERATOR" ||
        user.role === "AGENT"
    );

    if (!canUpdateAll) {
      return { success: false, error: "You don't have permission to archive all selected tickets" };
    }

    const now = new Date();
    const result = await prisma.ticket.updateMany({
      where: { id: { in: ticketIds } },
      data: { archivedAt: now },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        archived: result.count,
        failed: ticketIds.length - result.count,
      },
      message: `Successfully archived ${result.count} ticket${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk archive tickets error:", error);
    return { success: false, error: "Failed to archive tickets. Please try again." };
  }
}

/**
 * Bulk unarchive tickets.
 */
export async function bulkUnarchiveTickets(
  ticketIds: string[]
): Promise<ActionResult<{ unarchived: number; failed: number }>> {
  try {
    const user = await requireAuth();

    if (!ticketIds || ticketIds.length === 0) {
      return { success: false, error: "No tickets selected" };
    }

    const tickets = await prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true, createdById: true },
    });

    if (tickets.length === 0) {
      return { success: false, error: "No tickets found" };
    }

    const canUpdateAll = tickets.every(
      (t) =>
        t.createdById === user.id ||
        user.role === "ADMIN" ||
        user.role === "MODERATOR" ||
        user.role === "AGENT"
    );

    if (!canUpdateAll) {
      return { success: false, error: "You don't have permission to unarchive all selected tickets" };
    }

    const result = await prisma.ticket.updateMany({
      where: { id: { in: ticketIds } },
      data: { archivedAt: null },
    });

    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        unarchived: result.count,
        failed: ticketIds.length - result.count,
      },
      message: `Successfully unarchived ${result.count} ticket${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    console.error("Bulk unarchive tickets error:", error);
    return { success: false, error: "Failed to unarchive tickets. Please try again." };
  }
}
