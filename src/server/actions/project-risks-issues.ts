"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canEditProject } from "./projects";
import { revalidatePath } from "next/cache";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "IDENTIFIED" | "MONITORING" | "MITIGATED" | "RESOLVED" | "ACCEPTED";
export type IssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type RiskInput = {
  title: string;
  description?: string;
  severity?: RiskSeverity;
  status?: RiskStatus;
  probability?: number;
  impact?: string;
  mitigationPlan?: string;
  ownerId?: string;
};

export type RiskUpdateInput = Partial<RiskInput> & {
  resolvedDate?: Date | string | null;
};

export type IssueInput = {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  assignedToId?: string;
  impact?: string;
};

export type IssueUpdateInput = Partial<IssueInput> & {
  resolution?: string;
  resolvedDate?: Date | string | null;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// Risk Actions
export async function createRisk(
  projectId: string,
  input: RiskInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create risks for this project",
      };
    }

    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Risk title is required",
        fieldErrors: { title: ["Risk title cannot be empty"] },
      };
    }

    if (input.probability !== undefined && (input.probability < 0 || input.probability > 1)) {
      return {
        success: false,
        error: "Probability must be between 0 and 1",
        fieldErrors: { probability: ["Probability must be between 0 and 1"] },
      };
    }

    const risk = await prisma.projectRisk.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim(),
        severity: input.severity || "MEDIUM",
        status: input.status || "IDENTIFIED",
        probability: input.probability,
        impact: input.impact?.trim(),
        mitigationPlan: input.mitigationPlan?.trim(),
        ownerId: input.ownerId,
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: risk.id },
      message: "Risk created successfully",
    };
  } catch (error) {
    console.error("Error creating risk:", error);
    return {
      success: false,
      error: "Failed to create risk. Please try again.",
    };
  }
}

export async function updateRisk(
  riskId: string,
  input: RiskUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const risk = await prisma.projectRisk.findUnique({
      where: { id: riskId },
      select: { projectId: true },
    });

    if (!risk) {
      return {
        success: false,
        error: "Risk not found",
      };
    }

    if (!(await canEditProject(user.id, risk.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this risk",
      };
    }

    if (input.probability !== undefined && (input.probability < 0 || input.probability > 1)) {
      return {
        success: false,
        error: "Probability must be between 0 and 1",
        fieldErrors: { probability: ["Probability must be between 0 and 1"] },
      };
    }

    const resolvedDate = input.resolvedDate
      ? new Date(input.resolvedDate)
      : input.resolvedDate === null
      ? null
      : undefined;

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.probability !== undefined) updateData.probability = input.probability;
    if (input.impact !== undefined) updateData.impact = input.impact?.trim();
    if (input.mitigationPlan !== undefined) updateData.mitigationPlan = input.mitigationPlan?.trim();
    if (input.ownerId !== undefined) updateData.ownerId = input.ownerId;
    if (input.resolvedDate !== undefined) updateData.resolvedDate = resolvedDate;

    if (input.status === "RESOLVED" && !resolvedDate) {
      updateData.resolvedDate = new Date();
    }

    await prisma.projectRisk.update({
      where: { id: riskId },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${risk.projectId}`);

    return {
      success: true,
      message: "Risk updated successfully",
    };
  } catch (error) {
    console.error("Error updating risk:", error);
    return {
      success: false,
      error: "Failed to update risk. Please try again.",
    };
  }
}

export async function deleteRisk(riskId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const risk = await prisma.projectRisk.findUnique({
      where: { id: riskId },
      select: { projectId: true },
    });

    if (!risk) {
      return {
        success: false,
        error: "Risk not found",
      };
    }

    if (!(await canEditProject(user.id, risk.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this risk",
      };
    }

    await prisma.projectRisk.delete({
      where: { id: riskId },
    });

    revalidatePath(`/dashboard/projects/${risk.projectId}`);

    return {
      success: true,
      message: "Risk deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting risk:", error);
    return {
      success: false,
      error: "Failed to delete risk. Please try again.",
    };
  }
}

export async function getProjectRisks(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.projectRisk.findMany({
    where: { projectId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { severity: "desc" },
      { createdAt: "desc" },
    ],
  });
}

// Issue Actions
export async function createIssue(
  projectId: string,
  input: IssueInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create issues for this project",
      };
    }

    if (!input.title || input.title.trim().length === 0) {
      return {
        success: false,
        error: "Issue title is required",
        fieldErrors: { title: ["Issue title cannot be empty"] },
      };
    }

    const issue = await prisma.projectIssue.create({
      data: {
        projectId,
        title: input.title.trim(),
        description: input.description?.trim(),
        status: input.status || "OPEN",
        priority: input.priority || "MEDIUM",
        assignedToId: input.assignedToId,
        reportedById: user.id,
        impact: input.impact?.trim(),
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: issue.id },
      message: "Issue created successfully",
    };
  } catch (error) {
    console.error("Error creating issue:", error);
    return {
      success: false,
      error: "Failed to create issue. Please try again.",
    };
  }
}

export async function updateIssue(
  issueId: string,
  input: IssueUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const issue = await prisma.projectIssue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });

    if (!issue) {
      return {
        success: false,
        error: "Issue not found",
      };
    }

    if (!(await canEditProject(user.id, issue.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this issue",
      };
    }

    const resolvedDate = input.resolvedDate
      ? new Date(input.resolvedDate)
      : input.resolvedDate === null
      ? null
      : undefined;

    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.status !== undefined) updateData.status = input.status;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.assignedToId !== undefined) updateData.assignedToId = input.assignedToId;
    if (input.impact !== undefined) updateData.impact = input.impact?.trim();
    if (input.resolution !== undefined) updateData.resolution = input.resolution?.trim();
    if (input.resolvedDate !== undefined) updateData.resolvedDate = resolvedDate;

    if (input.status === "RESOLVED" && !resolvedDate) {
      updateData.resolvedDate = new Date();
    }

    await prisma.projectIssue.update({
      where: { id: issueId },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${issue.projectId}`);

    return {
      success: true,
      message: "Issue updated successfully",
    };
  } catch (error) {
    console.error("Error updating issue:", error);
    return {
      success: false,
      error: "Failed to update issue. Please try again.",
    };
  }
}

export async function deleteIssue(issueId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const issue = await prisma.projectIssue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    });

    if (!issue) {
      return {
        success: false,
        error: "Issue not found",
      };
    }

    if (!(await canEditProject(user.id, issue.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this issue",
      };
    }

    await prisma.projectIssue.delete({
      where: { id: issueId },
    });

    revalidatePath(`/dashboard/projects/${issue.projectId}`);

    return {
      success: true,
      message: "Issue deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting issue:", error);
    return {
      success: false,
      error: "Failed to delete issue. Please try again.",
    };
  }
}

export async function getProjectIssues(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.projectIssue.findMany({
    where: { projectId },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reportedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });
}
