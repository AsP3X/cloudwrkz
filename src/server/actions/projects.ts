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

  let nextSequence = 1;
  if (existingProjects.length > 0) {
    const lastCode = existingProjects[0].code;
    const match = lastCode.match(/PROJ-(\d+)$/);
    if (match) {
      nextSequence = parseInt(match[1], 10) + 1;
    }
  }

  // Format with leading zeros (e.g., PROJ-001, PROJ-002)
  const paddedSequence = nextSequence.toString().padStart(6, "0");
  return `PROJ-${paddedSequence}`;
}

/**
 * Validate project status transition
 */
function isValidStatusTransition(
  currentStatus: ProjectStatus,
  newStatus: ProjectStatus
): boolean {
  // Can't go back from completed, cancelled, or archived
  if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(currentStatus)) {
    return false;
  }
  
  // Can transition to any status except backwards from terminal states
  return true;
}

/**
 * Check if user has permission to view a project
 */
async function canViewProject(userId: string, projectId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Admins can view all projects
  if (user?.role === "ADMIN") {
    return true;
  }

  // Check if user is a member or manager of the project
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId,
    },
  });

  if (membership) {
    return true;
  }

  // Check if user is in a group assigned to the project
  const userGroups = await prisma.groupMembership.findMany({
    where: { userId },
    select: { groupId: true },
  });

  if (userGroups.length > 0) {
    const groupIds = userGroups.map((g) => g.groupId);
    const projectGroup = await prisma.projectGroup.findFirst({
      where: {
        projectId,
        groupId: { in: groupIds },
      },
    });

    if (projectGroup) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user has permission to edit a project
 */
async function canEditProject(userId: string, projectId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Admins can edit all projects
  if (user?.role === "ADMIN") {
    return true;
  }

  // Check if user is a manager or member of the project
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId,
      role: { in: ["MANAGER", "MEMBER"] },
    },
  });

  return !!membership;
}

/**
 * Check if user has permission to delete a project
 */
async function canDeleteProject(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Only admins can delete projects
  return user?.role === "ADMIN" ?? false;
}

/**
 * Create a new project
 */
export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    // Only admins can create projects
    await requireRole("ADMIN");
    const user = await requireAuth();

    // Validate input
    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Project name is required",
        fieldErrors: { name: ["Project name cannot be empty"] },
      };
    }

    // Parse dates first
    const startDate = input.startDate
      ? new Date(input.startDate)
      : null;
    const endDate = input.endDate ? new Date(input.endDate) : null;

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return {
        success: false,
        error: "End date must be after start date",
        fieldErrors: { endDate: ["End date must be after start date"] },
      };
    }

    // Generate unique project code
    const projectCode = await generateProjectCode();
    
    // Double-check code doesn't exist (race condition protection)
    const existing = await prisma.project.findUnique({
      where: { code: projectCode },
    });
    
    let finalCode = projectCode;
    if (existing) {
      // If code exists, generate a new one with timestamp fallback
      const timestamp = Date.now().toString(36).toUpperCase();
      const fallbackCode = `PROJ-${timestamp.slice(-6)}`;
      const fallbackExists = await prisma.project.findUnique({
        where: { code: fallbackCode },
      });
      
      if (fallbackExists) {
        return {
          success: false,
          error: "Failed to generate unique project code. Please try again.",
        };
      }
      
      finalCode = fallbackCode;
    }

    // Create project
    const project = await prisma.project.create({
      data: {
        code: finalCode,
        name: input.name.trim(),
        description: input.description?.trim(),
        status: input.status || "PLANNING",
        priority: input.priority || "MEDIUM",
        startDate,
        endDate,
        budget: input.budget,
        client: input.client?.trim(),
        color: input.color,
        icon: input.icon,
        permissions: input.permissions || {},
        createdById: user.id,
      },
    });

    // Add project members (managers and members)
    const allUserIds = [
      ...(input.managerIds || []),
      ...(input.memberIds || []),
    ];
    const uniqueUserIds = Array.from(new Set(allUserIds));

    if (uniqueUserIds.length > 0) {
      // Verify users exist
      const users = await prisma.user.findMany({
        where: {
          id: { in: uniqueUserIds },
        },
        select: { id: true },
      });

      const validUserIds = users.map((u) => u.id);
      const managerIds = input.managerIds?.filter((id) => validUserIds.includes(id)) || [];
      const memberIds = input.memberIds?.filter((id) => validUserIds.includes(id)) || [];

      // Create manager memberships
      if (managerIds.length > 0) {
        await prisma.projectUser.createMany({
          data: managerIds.map((userId) => ({
            projectId: project.id,
            userId,
            role: "MANAGER",
          })),
        });
      }

      // Create member memberships (excluding those already added as managers)
      const memberOnlyIds = memberIds.filter((id) => !managerIds.includes(id));
      if (memberOnlyIds.length > 0) {
        await prisma.projectUser.createMany({
          data: memberOnlyIds.map((userId) => ({
            projectId: project.id,
            userId,
            role: "MEMBER",
          })),
        });
      }
    }

    // Add project groups
    if (input.groupIds && input.groupIds.length > 0) {
      // Verify groups exist
      const groups = await prisma.group.findMany({
        where: {
          id: { in: input.groupIds },
        },
        select: { id: true },
      });

      const validGroupIds = groups.map((g) => g.id);
      if (validGroupIds.length > 0) {
        await prisma.projectGroup.createMany({
          data: validGroupIds.map((groupId) => ({
            projectId: project.id,
            groupId,
          })),
        });
      }
    }

    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: { id: project.id },
      message: "Project created successfully",
    };
  } catch (error) {
    console.error("Error creating project:", error);
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
  projectId: string,
  input: ProjectUpdateInput
): Promise<ActionResult> {
  try {
    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    const user = await requireAuth();

    // Check permissions
    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to edit this project",
      };
    }

    // Get current project
    const currentProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });

    if (!currentProject) {
      return {
        success: false,
        error: "Project not found",
      };
    }

    // Validate status transition
    if (input.status && input.status !== currentProject.status) {
      if (!isValidStatusTransition(currentProject.status as ProjectStatus, input.status)) {
        return {
          success: false,
          error: `Cannot change status from ${currentProject.status} to ${input.status}`,
          fieldErrors: {
            status: [
              `Cannot change status from ${currentProject.status} to ${input.status}. Once a project is completed, cancelled, or archived, it cannot be changed.`,
            ],
          },
        };
      }
    }

    // Parse dates
    const startDate = input.startDate
      ? new Date(input.startDate)
      : undefined;
    const endDate = input.endDate ? new Date(input.endDate) : undefined;

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return {
        success: false,
        error: "End date must be after start date",
        fieldErrors: { endDate: ["End date must be after start date"] },
      };
    }

    // Prepare update data
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.status !== undefined) updateData.status = input.status;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.startDate !== undefined) updateData.startDate = startDate;
    if (input.endDate !== undefined) updateData.endDate = endDate;
    if (input.budget !== undefined) updateData.budget = input.budget;
    if (input.client !== undefined) updateData.client = input.client?.trim();
    if (input.color !== undefined) updateData.color = input.color;
    if (input.icon !== undefined) updateData.icon = input.icon;
    if (input.permissions !== undefined) updateData.permissions = input.permissions;

    // Update project
    await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });

    // Update members if provided
    if (input.managerIds !== undefined || input.memberIds !== undefined) {
      // Remove all existing memberships
      await prisma.projectUser.deleteMany({
        where: { projectId },
      });

      // Add new memberships
      const allUserIds = [
        ...(input.managerIds || []),
        ...(input.memberIds || []),
      ];
      const uniqueUserIds = Array.from(new Set(allUserIds));

      if (uniqueUserIds.length > 0) {
        const users = await prisma.user.findMany({
          where: {
            id: { in: uniqueUserIds },
          },
          select: { id: true },
        });

        const validUserIds = users.map((u) => u.id);
        const managerIds = input.managerIds?.filter((id) => validUserIds.includes(id)) || [];
        const memberIds = input.memberIds?.filter((id) => validUserIds.includes(id)) || [];

        if (managerIds.length > 0) {
          await prisma.projectUser.createMany({
            data: managerIds.map((userId) => ({
              projectId,
              userId,
              role: "MANAGER",
            })),
          });
        }

        const memberOnlyIds = memberIds.filter((id) => !managerIds.includes(id));
        if (memberOnlyIds.length > 0) {
          await prisma.projectUser.createMany({
            data: memberOnlyIds.map((userId) => ({
              projectId,
              userId,
              role: "MEMBER",
            })),
          });
        }
      }
    }

    // Update groups if provided
    if (input.groupIds !== undefined) {
      // Remove all existing group memberships
      await prisma.projectGroup.deleteMany({
        where: { projectId },
      });

      // Add new group memberships
      if (input.groupIds.length > 0) {
        const groups = await prisma.group.findMany({
          where: {
            id: { in: input.groupIds },
          },
          select: { id: true },
        });

        const validGroupIds = groups.map((g) => g.id);
        if (validGroupIds.length > 0) {
          await prisma.projectGroup.createMany({
            data: validGroupIds.map((groupId) => ({
              projectId,
              groupId,
            })),
          });
        }
      }
    }

    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Project updated successfully",
    };
  } catch (error) {
    console.error("Error updating project:", error);
    return {
      success: false,
      error: "Failed to update project. Please try again.",
    };
  }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<ActionResult> {
  try {
    // Check if projects module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Projects module is not enabled",
      };
    }

    const user = await requireAuth();

    // Check permissions (only admins can delete)
    if (!(await canDeleteProject(user.id))) {
      return {
        success: false,
        error: "You don't have permission to delete projects",
      };
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return {
        success: false,
        error: "Project not found",
      };
    }

    // Delete project (cascade will handle related records)
    await prisma.project.delete({
      where: { id: projectId },
    });

    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Project deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting project:", error);
    return {
      success: false,
      error: "Failed to delete project. Please try again.",
    };
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string) {
  const user = await requireAuth();

  // Check if projects module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (!moduleEnabled) {
    return null;
  }

  // Check permissions
  if (!(await canViewProject(user.id, projectId))) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
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
  });

  return project;
}

/**
 * Get all projects accessible to the current user
 */
export async function getAllProjects() {
  const user = await requireAuth();

  // Check if projects module is enabled
  const moduleEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  if (!moduleEnabled) {
    return [];
  }

  // If admin, return all projects
  if (user.role === "ADMIN") {
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

  // Get user's project memberships
  const userMemberships = await prisma.projectUser.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });

  const projectIdsFromMembership = userMemberships.map((m) => m.projectId);

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
    new Set([...projectIdsFromMembership, ...projectIdsFromGroups])
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
