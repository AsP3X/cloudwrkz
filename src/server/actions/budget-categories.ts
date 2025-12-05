"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { canEditProject } from "./projects";
import { revalidatePath } from "next/cache";

export type BudgetCategoryInput = {
  name: string;
  description?: string;
  budgetedAmount: number;
};

export type BudgetCategoryUpdateInput = Partial<BudgetCategoryInput> & {
  spentAmount?: number;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createBudgetCategory(
  projectId: string,
  input: BudgetCategoryInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAuth();

    if (!(await canEditProject(user.id, projectId))) {
      return {
        success: false,
        error: "You don't have permission to create budget categories for this project",
      };
    }

    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Category name is required",
        fieldErrors: { name: ["Category name cannot be empty"] },
      };
    }

    if (input.budgetedAmount < 0) {
      return {
        success: false,
        error: "Budgeted amount cannot be negative",
        fieldErrors: { budgetedAmount: ["Budgeted amount cannot be negative"] },
      };
    }

    const category = await prisma.budgetCategory.create({
      data: {
        projectId,
        name: input.name.trim(),
        description: input.description?.trim(),
        budgetedAmount: input.budgetedAmount,
        spentAmount: 0,
      },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);

    return {
      success: true,
      data: { id: category.id },
      message: "Budget category created successfully",
    };
  } catch (error) {
    console.error("Error creating budget category:", error);
    return {
      success: false,
      error: "Failed to create budget category. Please try again.",
    };
  }
}

export async function updateBudgetCategory(
  categoryId: string,
  input: BudgetCategoryUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      select: { projectId: true },
    });

    if (!category) {
      return {
        success: false,
        error: "Budget category not found",
      };
    }

    if (!(await canEditProject(user.id, category.projectId))) {
      return {
        success: false,
        error: "You don't have permission to update this budget category",
      };
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      return {
        success: false,
        error: "Category name cannot be empty",
        fieldErrors: { name: ["Category name cannot be empty"] },
      };
    }

    if (input.budgetedAmount !== undefined && input.budgetedAmount < 0) {
      return {
        success: false,
        error: "Budgeted amount cannot be negative",
        fieldErrors: { budgetedAmount: ["Budgeted amount cannot be negative"] },
      };
    }

    if (input.spentAmount !== undefined && input.spentAmount < 0) {
      return {
        success: false,
        error: "Spent amount cannot be negative",
        fieldErrors: { spentAmount: ["Spent amount cannot be negative"] },
      };
    }

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined) updateData.description = input.description?.trim();
    if (input.budgetedAmount !== undefined) updateData.budgetedAmount = input.budgetedAmount;
    if (input.spentAmount !== undefined) updateData.spentAmount = input.spentAmount;

    await prisma.budgetCategory.update({
      where: { id: categoryId },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${category.projectId}`);

    return {
      success: true,
      message: "Budget category updated successfully",
    };
  } catch (error) {
    console.error("Error updating budget category:", error);
    return {
      success: false,
      error: "Failed to update budget category. Please try again.",
    };
  }
}

export async function deleteBudgetCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const category = await prisma.budgetCategory.findUnique({
      where: { id: categoryId },
      select: { projectId: true },
    });

    if (!category) {
      return {
        success: false,
        error: "Budget category not found",
      };
    }

    if (!(await canEditProject(user.id, category.projectId))) {
      return {
        success: false,
        error: "You don't have permission to delete this budget category",
      };
    }

    await prisma.budgetCategory.delete({
      where: { id: categoryId },
    });

    revalidatePath(`/dashboard/projects/${category.projectId}`);

    return {
      success: true,
      message: "Budget category deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting budget category:", error);
    return {
      success: false,
      error: "Failed to delete budget category. Please try again.",
    };
  }
}

export async function getProjectBudgetCategories(projectId: string) {
  const user = await requireAuth();

  const { canViewProject } = await import("./projects");
  if (!(await canViewProject(user.id, projectId))) {
    return [];
  }

  return prisma.budgetCategory.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}
