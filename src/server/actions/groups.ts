"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireRole, requireAnyRole } from "@/lib/utils/auth-server";

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
      _count: {
        select: {
          members: true,
          tickets: true,
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
 */
export async function addAgentToGroup(
  groupId: string,
  agentId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    // Verify the user is an agent
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { role: true },
    });

    if (!agent || (agent.role !== "AGENT" && agent.role !== "ADMIN" && agent.role !== "MODERATOR")) {
      return {
        success: false,
        error: "User must be an agent, admin, or moderator",
      };
    }

    // Check if already a member
    const existing = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: agentId,
          groupId,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        error: "Agent is already a member of this group",
      };
    }

    await prisma.groupMembership.create({
      data: {
        userId: agentId,
        groupId,
      },
    });

    return {
      success: true,
      message: "Agent added to group successfully",
    };
  } catch (error: any) {
    console.error("Add agent to group error:", error);
    return {
      success: false,
      error: error.message || "Failed to add agent to group",
    };
  }
}

/**
 * Remove an agent from a group (only admins and moderators)
 */
export async function removeAgentFromGroup(
  groupId: string,
  agentId: string
): Promise<ActionResult> {
  try {
    await requireAnyRole("ADMIN", "MODERATOR");

    await prisma.groupMembership.delete({
      where: {
        userId_groupId: {
          userId: agentId,
          groupId,
        },
      },
    });

    return {
      success: true,
      message: "Agent removed from group successfully",
    };
  } catch (error: any) {
    console.error("Remove agent from group error:", error);
    return {
      success: false,
      error: error.message || "Failed to remove agent from group",
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
