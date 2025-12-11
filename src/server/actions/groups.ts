"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireRole, requireAnyRole } from "@/lib/utils/auth-server";
import {
  clearPermissionCache,
  generateTicketPermissionKey,
  parseTicketPermissionKey,
  isValidTicketId,
  type TicketPermissionAction,
  TICKET_PERMISSION_ACTIONS,
} from "@/lib/utils/permissions";

export type GroupInput = {
  name: string;
  description?: string;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Get all groups (for admins/moderators) or groups the user is a member of (for agents)
 */
export async function getGroups() {
  const user = await requireAuth();

  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    // Admins and moderators can see all groups
    return prisma.group.findMany({
      include: {
        _count: {
          select: {
            members: true,
            tickets: true,
            permissions: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  if (user.role === "AGENT") {
    // Agents can only see groups they're members of
    const memberships = await prisma.groupMembership.findMany({
      where: {
        userId: user.id,
      },
      include: {
        group: {
          include: {
            _count: {
              select: {
                members: true,
                tickets: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    return memberships.map((m) => m.group);
  }

  return [];
}

/**
 * Get a single group by ID
 */
export async function getGroup(id: string) {
  const user = await requireAuth();

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
      },
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: {
          members: true,
          tickets: true,
          permissions: true,
        },
      },
    },
  });

  if (!group) {
    return null;
  }

  // Check if user has access (admin/moderator or member)
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    return group;
  }

  if (user.role === "AGENT") {
    const isMember = group.members.some((m) => m.userId === user.id);
    if (isMember) {
      return group;
    }
  }

  return null;
}

/**
 * Create a new group (only admins and moderators)
 */
export async function createGroup(input: GroupInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Group name is required",
        fieldErrors: { name: ["Group name cannot be empty"] },
      };
    }

    const group = await prisma.group.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim(),
      },
      select: {
        id: true,
      },
    });

    return {
      success: true,
      data: { id: group.id },
      message: "Group created successfully",
    };
  } catch (error: any) {
    console.error("Create group error:", error);
    return {
      success: false,
      error: error.message || "Failed to create group",
    };
  }
}

/**
 * Update a group (only admins and moderators)
 */
export async function updateGroup(
  id: string,
  input: GroupInput
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Group name is required",
        fieldErrors: { name: ["Group name cannot be empty"] },
      };
    }

    await prisma.group.update({
      where: { id },
      data: {
        name: input.name.trim(),
        description: input.description?.trim(),
      },
    });

    return {
      success: true,
      message: "Group updated successfully",
    };
  } catch (error: any) {
    console.error("Update group error:", error);
    return {
      success: false,
      error: error.message || "Failed to update group",
    };
  }
}

/**
 * Delete a group (only admins and moderators)
 */
export async function deleteGroup(id: string): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    await prisma.group.delete({
      where: { id },
    });

    return {
      success: true,
      message: "Group deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete group error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete group",
    };
  }
}

/**
 * Add an agent to a group (only admins and moderators)
 * @deprecated Use addUserToGroup instead
 */
export async function addAgentToGroup(
  groupId: string,
  agentId: string
): Promise<ActionResult> {
  return addUserToGroup(groupId, agentId);
}

/**
 * Add a user to a group (only admins and moderators)
 */
export async function addUserToGroup(
  groupId: string,
  userId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    // Verify the user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });

    if (!user) {
      return {
        success: false,
        error: "User not found",
      };
    }

    if (user.status !== "ACTIVE") {
      return {
        success: false,
        error: "Cannot add inactive users to groups",
      };
    }

    // Check if already a member
    const existing = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: userId,
          groupId,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: "User is already a member of this group",
      };
    }

    await prisma.groupMembership.create({
      data: {
        userId: userId,
        groupId,
      },
    });

    // Clear permission cache for the user
    clearPermissionCache(userId);

    return {
      success: true,
      message: "User added to group successfully",
    };
  } catch (error: any) {
    console.error("Add user to group error:", error);
    return {
      success: false,
      error: error.message || "Failed to add user to group",
    };
  }
}

/**
 * Remove an agent from a group (only admins and moderators)
 * @deprecated Use removeUserFromGroup instead
 */
export async function removeAgentFromGroup(
  groupId: string,
  agentId: string
): Promise<ActionResult> {
  return removeUserFromGroup(groupId, agentId);
}

/**
 * Remove a user from a group (only admins and moderators)
 */
export async function removeUserFromGroup(
  groupId: string,
  userId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    await prisma.groupMembership.delete({
      where: {
        userId_groupId: {
          userId: userId,
          groupId,
        },
      },
    });

    // Clear permission cache for the user
    clearPermissionCache(userId);

    return {
      success: true,
      message: "User removed from group successfully",
    };
  } catch (error: any) {
    console.error("Remove user from group error:", error);
    return {
      success: false,
      error: error.message || "Failed to remove user from group",
    };
  }
}

/**
 * Get groups that an agent is a member of
 */
export async function getAgentGroups(agentId: string) {
  await requireAuth();

  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId: agentId,
    },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });

  return memberships.map((m) => m.group);
}

/**
 * Create or get a dynamic ticket permission
 * This creates the permission in the database if it doesn't exist
 */
async function createOrGetDynamicPermission(
  permissionKey: string,
  ticketId: string,
  ticketPrefix: string,
  ticketNumber: string,
  action: TicketPermissionAction
) {
  // Check if permission already exists
  let permission = await prisma.permission.findUnique({
    where: { key: permissionKey },
  });

  if (!permission) {
    // Create the dynamic permission
    const actionNames: Record<TicketPermissionAction, string> = {
      view: "View",
      comment: "Comment",
      create: "Create",
      update: "Update",
      delete: "Delete",
      assign: "Assign",
      "time_entries.view": "View Time Entries",
      "time_entries.create": "Create Time Entries",
    };

    permission = await prisma.permission.create({
      data: {
        key: permissionKey,
        name: `Ticket ${ticketNumber} - ${actionNames[action]}`,
        description: `Permission to ${actionNames[action].toLowerCase()} ticket ${ticketNumber}`,
        category: "tickets",
        module: "tickets",
      },
    });
  }

  return permission;
}

/**
 * Add permission to group (supports both static and dynamic permissions)
 */
export async function addPermissionToGroup(
  groupId: string,
  permissionId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    // Check if already exists
    const existing = await prisma.groupPermission.findUnique({
      where: {
        groupId_permissionId: {
          groupId,
          permissionId,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: "Permission is already assigned to this group",
      };
    }

    await prisma.groupPermission.create({
      data: {
        groupId,
        permissionId,
      },
    });

    // Clear permission cache for all members of this group
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    members.forEach((m) => clearPermissionCache(m.userId));

    return {
      success: true,
      message: "Permission added to group successfully",
    };
  } catch (error: any) {
    console.error("Add permission to group error:", error);
    return {
      success: false,
      error: error.message || "Failed to add permission to group",
    };
  }
}

/**
 * Add a dynamic ticket permission to a group
 * Creates the permission if it doesn't exist
 */
export async function addDynamicTicketPermissionToGroup(
  groupId: string,
  ticketId: string,
  ticketPrefix: string,
  ticketNumber: string,
  action: TicketPermissionAction
): Promise<ActionResult<{ permissionId: string }>> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    // Validate ticket ID format
    if (!isValidTicketId(ticketId)) {
      return {
        success: false,
        error: "Invalid ticket ID format",
      };
    }

    // Generate permission key using ticket ID and prefix
    const permissionKey = generateTicketPermissionKey(ticketId, ticketPrefix, action);

    // Create or get the permission
    const permission = await createOrGetDynamicPermission(
      permissionKey,
      ticketId,
      ticketPrefix,
      ticketNumber,
      action
    );

    // Check if already assigned to group
    const existing = await prisma.groupPermission.findUnique({
      where: {
        groupId_permissionId: {
          groupId,
          permissionId: permission.id,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: "Permission is already assigned to this group",
      };
    }

    // Add to group
    await prisma.groupPermission.create({
      data: {
        groupId,
        permissionId: permission.id,
      },
    });

    // Clear permission cache for all members of this group
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    members.forEach((m) => clearPermissionCache(m.userId));

    // Revalidate all ticket-related pages to ensure permissions are updated
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard/tickets/[id]", "page");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: { permissionId: permission.id },
      message: "Dynamic ticket permission added to group successfully",
    };
  } catch (error: any) {
    console.error("Add dynamic ticket permission to group error:", error);
    return {
      success: false,
      error: error.message || "Failed to add dynamic ticket permission to group",
    };
  }
}

/**
 * Remove permission from group
 */
export async function removePermissionFromGroup(
  groupId: string,
  permissionId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    await prisma.groupPermission.delete({
      where: {
        groupId_permissionId: {
          groupId,
          permissionId,
        },
      },
    });

    // Clear permission cache for all members of this group
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    members.forEach((m) => clearPermissionCache(m.userId));

    // Revalidate all ticket-related pages to ensure permissions are updated
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard/tickets/[id]", "page");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Permission removed from group successfully",
    };
  } catch (error: any) {
    console.error("Remove permission from group error:", error);
    return {
      success: false,
      error: error.message || "Failed to remove permission from group",
    };
  }
}

/**
 * Bulk update group permissions
 * Supports both static permissions (by ID) and dynamic permissions (by key)
 */
export async function updateGroupPermissions(
  groupId: string,
  permissionIds: string[]
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    // Get current permissions
    const currentPermissions = await prisma.groupPermission.findMany({
      where: { groupId },
      select: { permissionId: true },
    });

    const currentIds = new Set(currentPermissions.map((p) => p.permissionId));
    const newIds = new Set(permissionIds);

    // Find permissions to add and remove
    const toAdd = permissionIds.filter((id) => !currentIds.has(id));
    const toRemove = currentPermissions
      .filter((p) => !newIds.has(p.permissionId))
      .map((p) => p.permissionId);

    // Perform updates in transaction
    await prisma.$transaction(async (tx) => {
      // Remove permissions
      if (toRemove.length > 0) {
        await tx.groupPermission.deleteMany({
          where: {
            groupId,
            permissionId: { in: toRemove },
          },
        });
      }

      // Add permissions
      if (toAdd.length > 0) {
        await tx.groupPermission.createMany({
          data: toAdd.map((permissionId) => ({
            groupId,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
    });

    // Clear permission cache for all members of this group
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    members.forEach((m) => clearPermissionCache(m.userId));

    // Revalidate all ticket-related pages to ensure permissions are updated
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard/tickets");
    revalidatePath("/dashboard/tickets/[id]", "page");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Group permissions updated successfully",
    };
  } catch (error: any) {
    console.error("Update group permissions error:", error);
    return {
      success: false,
      error: error.message || "Failed to update group permissions",
    };
  }
}
