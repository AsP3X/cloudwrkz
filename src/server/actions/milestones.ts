"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canEditProject } from "./projects";
import { revalidatePath } from "next/cache";

export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "CANCELLED";

export type MilestoneInput = {
  name: string;
  description?: string;
  status?: MilestoneStatus;
  targetDate?: Date | string;
  order?: number;
};

export type MilestoneUpdateInput = Partial<MilestoneInput> & {
  completedDate?: Date | string | null;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createMilestone(
  projectId: string,
  input: MilestoneInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create milestones for this project",
      };
    }

    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Milestone name is required",
        fieldErrors: { name: ["Milestone name cannot be empty"] },
      };
    }

    const targetDate = input.targetDate ? new Date(input.targetDate) : null;

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        name: input.name.trim(),
        description: input.description?.trim(),
        status: input.status || "NOT_STARTED",
        targetDate,
        order: input.order ?? 0,
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: milestone.id },
      message: "Milestone created successfully",
    };
  } catch (error) {
    console.error("Error creating milestone:", error);
    return {
      success: false,
      error: "Failed to create milestone. Please try again.",
    };
  }
}

export async function updateMilestone(
  milestoneId: string,
  input: MilestoneUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { projectId: true },
    });

    if (!milestone) {
      return {
        success: false,
        error: "Milestone not found",
      };
    }

    if (!(await canEditProject(user.id, milestone.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this milestone",
      };
    }

    const targetDate = input.targetDate ? new Date(input.targetDate) : undefined;
    const completedDate = input.completedDate
      ? new Date(input.completedDate)
      : input.completedDate === null
      ? null
      : undefined;

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.status !== undefined) updateData.status = input.status;
    if (input.targetDate !== undefined) updateData.targetDate = targetDate;
    if (input.completedDate !== undefined) updateData.completedDate = completedDate;
    if (input.order !== undefined) updateData.order = input.order;

    // Auto-set completedDate if status is COMPLETED
    if (input.status === "COMPLETED" && !completedDate) {
      updateData.completedDate = new Date();
    }

    await prisma.milestone.update({
      where: { id: milestoneId },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${milestone.projectId}`);

    return {
      success: true,
      message: "Milestone updated successfully",
    };
  } catch (error) {
    console.error("Error updating milestone:", error);
    return {
      success: false,
      error: "Failed to update milestone. Please try again.",
    };
  }
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { projectId: true },
    });

    if (!milestone) {
      return {
        success: false,
        error: "Milestone not found",
      };
    }

    if (!(await canEditProject(user.id, milestone.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this milestone",
      };
    }

    await prisma.milestone.delete({
      where: { id: milestoneId },
    });

    revalidatePath(`/dashboard/projects/${milestone.projectId}`);

    return {
      success: true,
      message: "Milestone deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting milestone:", error);
    return {
      success: false,
      error: "Failed to delete milestone. Please try again.",
    };
  }
}

export async function getProjectMilestones(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.milestone.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}
