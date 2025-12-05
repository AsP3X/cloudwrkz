"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireRole } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectUserRole = "MANAGER" | "MEMBER";

export type ProjectInput = {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  startDate?: Date | string;
  endDate?: Date | string;
  budget?: number;
  client?: string;
  color?: string;
  icon?: string;
  permissions?: Record<string, any>;
  managerIds?: string[]; // User IDs for project managers
  memberIds?: string[]; // User IDs for project members
  groupIds?: string[]; // Group IDs to assign to project
};

export type ProjectUpdateInput = Partial<ProjectInput> & {
  status?: ProjectStatus;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Generate project code (e.g., PROJ-001)
 * Uses a sequential approach to ensure uniqueness
 */
async function generateProjectCode(): Promise<string> {
  // Find the highest existing project code
  const existingProjects = await prisma.project.findMany({
    where: {
      code: {
        startsWith: "PROJ-",
      },
    },
    select: {
      code: true,
    },
    orderBy: {
      code: "desc",
    },
    take: 1,
  });

  let nextNumber = 1;
  if (existingProjects.length > 0) {
    const lastCode = existingProjects[0].code;
    const match = lastCode.match(/PROJ-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `PROJ-${nextNumber.toString().padStart(6, "0")}`;
}

/**
 * Create a new project
 */
export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Project name is required",
        fieldErrors: { name: ["Project name cannot be empty"] },
      };
    }

    // Generate unique project code
    const code = await generateProjectCode();

    // Create project
    const project = await prisma.project.create({
      data: {
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: input.status || "PLANNING",
        priority: input.priority || "MEDIUM",
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        budget: input.budget || null,
        client: input.client?.trim() || null,
        color: input.color || null,
        icon: input.icon || null,
        permissions: input.permissions || undefined,
        createdById: user.id,
      },
    });

    // Add project members (managers and members)
    const memberIds = [
      ...(input.managerIds || []),
      ...(input.memberIds || []),
    ];

    if (memberIds.length > 0) {
      // Remove duplicates
      const uniqueMemberIds = Array.from(new Set(memberIds));

      // Create project memberships
      await prisma.projectUser.createMany({
        data: uniqueMemberIds.map((userId, index) => ({
          projectId: project.id,
          userId,
          role: input.managerIds?.includes(userId) ? "MANAGER" : "MEMBER",
        })),
        skipDuplicates: true,
      });
    }

    // Add project groups
    if (input.groupIds && input.groupIds.length > 0) {
      await prisma.projectGroup.createMany({
        data: input.groupIds.map((groupId) => ({
          projectId: project.id,
          groupId,
        })),
        skipDuplicates: true,
      });
    }

    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: { id: project.id },
      message: "Project created successfully",
    };
  } catch (error) {
    console.error("Create project error:", error);
    return {
      success: false,
      error: "Failed to create project. Please try again.",
    };
  }
}

/**
 * Update a project
 */
export async function updateProject(
  id: string,
  input: ProjectUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    // Fetch current project
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        groups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return {
        success: false,
        error: "Project not found",
      };
    }

    // Check permissions: creator, managers, admins, or moderators can update
    const membership = project.members.find((m) => m.user.id === user.id);
    const canUpdate =
      project.createdById === user.id ||
      membership?.role === "MANAGER" ||
      user.role === "ADMIN" ||
      user.role === "MODERATOR";

    if (!canUpdate) {
      return {
        success: false,
        error: "You don't have permission to update this project",
      };
    }

    // Build update data
    const updateData: any = {};

    if (input.name !== undefined) {
      if (!input.name || input.name.trim().length === 0) {
        return {
          success: false,
          error: "Project name cannot be empty",
          fieldErrors: { name: ["Project name cannot be empty"] },
        };
      }
      updateData.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    if (input.priority !== undefined) {
      updateData.priority = input.priority;
    }

    if (input.startDate !== undefined) {
      updateData.startDate = input.startDate ? new Date(input.startDate) : null;
    }

    if (input.endDate !== undefined) {
      updateData.endDate = input.endDate ? new Date(input.endDate) : null;
    }

    if (input.budget !== undefined) {
      updateData.budget = input.budget || null;
    }

    if (input.client !== undefined) {
      updateData.client = input.client?.trim() || null;
    }

    if (input.color !== undefined) {
      updateData.color = input.color || null;
    }

    if (input.icon !== undefined) {
      updateData.icon = input.icon || null;
    }

    if (input.permissions !== undefined) {
      updateData.permissions = input.permissions || null;
    }

    // Update project
    await prisma.project.update({
      where: { id },
      data: updateData,
    });

    // Update members if provided
    if (input.managerIds !== undefined || input.memberIds !== undefined) {
      // Remove all existing memberships
      await prisma.projectUser.deleteMany({
        where: { projectId: id },
      });

      // Add new memberships
      const memberIds = [
        ...(input.managerIds || []),
        ...(input.memberIds || []),
      ];

      if (memberIds.length > 0) {
        const uniqueMemberIds = Array.from(new Set(memberIds));

        await prisma.projectUser.createMany({
          data: uniqueMemberIds.map((userId) => ({
            projectId: id,
            userId,
            role: input.managerIds?.includes(userId) ? "MANAGER" : "MEMBER",
          })),
          skipDuplicates: true,
        });
      }
    }

    // Update groups if provided
    if (input.groupIds !== undefined) {
      // Remove all existing group assignments
      await prisma.projectGroup.deleteMany({
        where: { projectId: id },
      });

      // Add new group assignments
      if (input.groupIds.length > 0) {
        await prisma.projectGroup.createMany({
          data: input.groupIds.map((groupId) => ({
            projectId: id,
            groupId,
          })),
          skipDuplicates: true,
        });
      }
    }

    revalidatePath(`/dashboard/projects/${id}`);
    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Project updated successfully",
    };
  } catch (error) {
    console.error("Update project error:", error);
    return {
      success: false,
      error: "Failed to update project. Please try again.",
    };
  }
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    // Fetch current project
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return {
        success: false,
        error: "Project not found",
      };
    }

    // Only creator, admins, or moderators can delete
    const canDelete =
      project.createdById === user.id ||
      user.role === "ADMIN" ||
      user.role === "MODERATOR";

    if (!canDelete) {
      return {
        success: false,
        error: "You don't have permission to delete this project",
      };
    }

    // Delete project (cascade will handle related records)
    await prisma.project.delete({
      where: { id },
    });

    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Project deleted successfully",
    };
  } catch (error) {
    console.error("Delete project error:", error);
    return {
      success: false,
      error: "Failed to delete project. Please try again.",
    };
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string) {
  const user = await requireAuth();

  // Check if projects module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (!moduleEnabled) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      },
      groups: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
      _count: {
        select: {
          tickets: true,
          timeEntries: true,
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  // Check if user has permission to view this project
  // For admins and moderators, they can view all projects
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    // Determine userRole for admins/moderators
    const membership = project.members.find((m) => m.user.id === user.id);
    const userRole = project.createdById === user.id 
      ? "OWNER" 
      : membership?.role === "MANAGER" 
        ? "MANAGER" 
        : membership 
          ? "MEMBER" 
          : "MEMBER";
    return { ...project, userRole };
  }

  // For agents, check if they're a member or if their groups are assigned
  if (user.role === "AGENT") {
    const membership = project.members.find((m) => m.user.id === user.id);
    if (membership) {
      const userRole = membership.role === "MANAGER" ? "MANAGER" : "MEMBER";
      return { ...project, userRole };
    }

    // Check if user's groups are assigned to the project
    const userGroups = await prisma.groupMembership.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });

    const groupIds = userGroups.map((g) => g.groupId);
    const projectGroupIds = project.groups.map((g) => g.groupId);

    if (groupIds.some((gid) => projectGroupIds.includes(gid))) {
      return { ...project, userRole: "MEMBER" as const };
    }

    // Check if user is the creator
    if (project.createdById === user.id) {
      return { ...project, userRole: "OWNER" as const };
    }

    return null;
  }

  // For regular users, check if they're a member or creator
  const membership = project.members.find((m) => m.user.id === user.id);
  if (membership || project.createdById === user.id) {
    // Add userRole to the project object
    const userRole = project.createdById === user.id 
      ? "OWNER" 
      : membership?.role === "MANAGER" 
        ? "MANAGER" 
        : "MEMBER";
    return { ...project, userRole };
  }

  return null;
}

/**
 * Get all projects accessible to the current user
 */
export async function getProjects() {
  const user = await requireAuth();

  // Check if projects module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (!moduleEnabled) {
    return [];
  }

  // For admins and moderators, return all projects
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    return prisma.project.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        groups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            tickets: true,
            timeEntries: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // Get user's project memberships (includes both MANAGER and MEMBER roles)
  const userMemberships = await prisma.projectUser.findMany({
    where: { 
      userId: user.id,
      // No role filter - we want both MANAGER and MEMBER roles
    },
    select: { projectId: true },
  });

  const projectIdsFromMembership = userMemberships.map((m) => m.projectId);

  // Get projects where user is the creator
  const createdProjects = await prisma.project.findMany({
    where: { createdById: user.id },
    select: { id: true },
  });

  const projectIdsFromCreator = createdProjects.map((p) => p.id);

  // Get user's groups
  const userGroups = await prisma.groupMembership.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });

  const groupIds = userGroups.map((g) => g.groupId);

  // Get projects where user's groups are assigned
  const projectGroups = await prisma.projectGroup.findMany({
    where: {
      groupId: { in: groupIds },
    },
    select: { projectId: true },
  });

  const projectIdsFromGroups = projectGroups.map((pg) => pg.projectId);

  // Combine all project IDs
  const allProjectIds = Array.from(
    new Set([...projectIdsFromMembership, ...projectIdsFromCreator, ...projectIdsFromGroups])
  );

  if (allProjectIds.length === 0) {
    return [];
  }

  return prisma.project.findMany({
    where: {
      id: { in: allProjectIds },
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      groups: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      },
      _count: {
        select: {
          tickets: true,
          timeEntries: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get all projects (alias for getProjects for backward compatibility)
 * For admins/moderators, returns all projects
 * For other users, returns projects they have access to
 */
export async function getAllProjects() {
  return getProjects();
}

/**
 * Check if a user can view a project
 * Returns true if user is admin, moderator, creator, member, or agent with group access
 */
export async function canViewProject(userId: string, projectId: string): Promise<boolean> {
  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    return false;
  }

  // Admins and moderators can view all projects
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    return true;
  }

  // Get project with members and groups
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
            },
          },
        },
      },
      groups: {
        include: {
          group: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return false;
  }

  // Creator can view
  if (project.createdById === userId) {
    return true;
  }

  // Check if user is a member
  const membership = project.members.find((m) => m.user.id === userId);
  if (membership) {
    return true;
  }

  // For agents, check if their groups are assigned to the project
  if (user.role === "AGENT") {
    const userGroups = await prisma.groupMembership.findMany({
      where: { userId: userId },
      select: { groupId: true },
    });

    const groupIds = userGroups.map((g) => g.groupId);
    const projectGroupIds = project.groups.map((g) => g.groupId);

    if (groupIds.some((gid) => projectGroupIds.includes(gid))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a user can edit a project
 * Returns true if user is creator, manager, admin, or moderator
 */
export async function canEditProject(userId: string, projectId: string): Promise<boolean> {
  // Get user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user) {
    return false;
  }

  // Admins and moderators can edit all projects
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    return true;
  }

  // Get project with members
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return false;
  }

  // Creator can edit
  if (project.createdById === userId) {
    return true;
  }

  // Managers can edit
  const membership = project.members.find((m) => m.user.id === userId);
  if (membership?.role === "MANAGER") {
    return true;
  }

  return false;
}

/**
 * Get projects that the current user is a member of
 * Used for ticket assignment - agents can only assign tickets to projects they're members of
 */
export async function getUserProjectsForAssignment() {
  const user = await requireAuth();

  // Get user's project memberships (includes both MANAGER and MEMBER roles)
  const userMemberships = await prisma.projectUser.findMany({
    where: { 
      userId: user.id,
    },
    select: { projectId: true },
  });

  const projectIdsFromMembership = userMemberships.map((m) => m.projectId);

  // Get projects where user is the creator
  const createdProjects = await prisma.project.findMany({
    where: { createdById: user.id },
    select: { id: true },
  });

  const projectIdsFromCreator = createdProjects.map((p) => p.id);

  // Get user's groups
  const userGroups = await prisma.groupMembership.findMany({
    where: { userId: user.id },
    select: { groupId: true },
  });

  const groupIds = userGroups.map((g) => g.groupId);

  // Get projects where user's groups are assigned
  const projectGroups = await prisma.projectGroup.findMany({
    where: {
      groupId: { in: groupIds },
    },
    select: { projectId: true },
  });

  const projectIdsFromGroups = projectGroups.map((pg) => pg.projectId);

  // Combine all project IDs
  const allProjectIds = Array.from(
    new Set([...projectIdsFromMembership, ...projectIdsFromCreator, ...projectIdsFromGroups])
  );

  if (allProjectIds.length === 0) {
    return [];
  }

  return prisma.project.findMany({
    where: {
      id: { in: allProjectIds },
    },
    select: {
      id: true,
      code: true,
      name: true,
      color: true,
      status: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get tickets for a project
 */
export async function getProjectTickets(projectId: string) {
  const user = await requireAuth();

  // Check if user can view the project
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.ticket.findMany({
    where: {
      projectId,
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get time allocation summary for a project
 * Groups time entries by user and ticket
 */
export async function getProjectTimeAllocation(projectId: string) {
  const user = await requireAuth();

  // Check if user can view the project
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  // Get all time entries for this project
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      projectId,
      status: "COMPLETED",
    },
    select: {
      id: true,
      userId: true,
      ticketId: true,
      totalDuration: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
        },
      },
    },
  });

  // Group by user and ticket
  const allocationMap = new Map<string, {
    userId: string;
    userName: string;
    ticketId: string | null;
    ticketNumber: string | null;
    ticketTitle: string | null;
    totalDuration: number;
    entries: Array<{ id: string; totalDuration: number }>;
  }>();

  for (const entry of timeEntries) {
    const key = `${entry.userId}-${entry.ticketId || "no-ticket"}`;
    
    if (!allocationMap.has(key)) {
      allocationMap.set(key, {
        userId: entry.userId,
        userName: entry.user.name || entry.user.email,
        ticketId: entry.ticketId,
        ticketNumber: entry.ticket?.ticketNumber || null,
        ticketTitle: entry.ticket?.title || null,
        totalDuration: 0,
        entries: [],
      });
    }

    const allocation = allocationMap.get(key)!;
    allocation.totalDuration += entry.totalDuration;
    allocation.entries.push({
      id: entry.id,
      totalDuration: entry.totalDuration,
    });
  }

  return Array.from(allocationMap.values());
}
