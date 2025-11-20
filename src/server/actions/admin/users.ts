"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "AGENT", "ADMIN", "MODERATOR"]),
  status: z.enum(["ACTIVE", "PENDING", "SUSPENDED"]),
});

const updateUserSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  name: z.string().min(1, "Name is required").optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.enum(["USER", "AGENT", "ADMIN", "MODERATOR"]).optional(),
  status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "DELETED"]).optional(),
});

export type UserFilters = {
  status?: "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED";
  role?: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
  search?: string;
  page?: number;
  limit?: number;
};

/**
 * Get all users with filters and pagination (admin only)
 */
export async function getAllUsersAdmin(filters: UserFilters = {}) {
  await requireRole("ADMIN");

  const {
    status,
    role,
    search,
    page = 1,
    limit = 50,
  } = filters;

  const skip = (page - 1) * limit;

  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (role) {
    where.role = role;
  }

  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            createdTickets: true,
            assignedTickets: true,
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get user by ID (admin only)
 */
export async function getUserByIdAdmin(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      avatar: true,
      role: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      _count: {
        select: {
          createdTickets: true,
          assignedTickets: true,
          sessions: true,
          ticketComments: true,
          groupMemberships: true,
        },
      },
    },
  });

  return user;
}

/**
 * Create a new user (admin only)
 */
export async function createUserAdmin(input: z.infer<typeof createUserSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole("ADMIN");

    const validationResult = createUserSchema.safeParse(input);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      validationResult.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      });

      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const { email, name, password, role, status } = validationResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return {
        success: false,
        error: "User with this email already exists",
        fieldErrors: { email: ["Email already in use"] },
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashedPassword,
        role,
        status,
        emailVerified: status === "ACTIVE", // Auto-verify if active
      },
      select: {
        id: true,
      },
    });

    revalidatePath("/dashboard/admin/users");

    return {
      success: true,
      data: { id: user.id },
      message: "User created successfully",
    };
  } catch (error: any) {
    console.error("Create user error:", error);
    return {
      success: false,
      error: error.message || "Failed to create user",
    };
  }
}

/**
 * Update user (admin only)
 */
export async function updateUserAdmin(
  userId: string,
  input: Partial<z.infer<typeof updateUserSchema>>
): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    const validationResult = updateUserSchema.partial().safeParse(input);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      validationResult.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      });

      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const data: any = {};

    if (validationResult.data.email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: validationResult.data.email,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        return {
          success: false,
          error: "Email already in use",
          fieldErrors: { email: ["Email already in use"] },
        };
      }

      data.email = validationResult.data.email;
    }

    if (validationResult.data.name !== undefined) {
      data.name = validationResult.data.name === "" ? null : validationResult.data.name;
    }

    if (validationResult.data.password !== undefined) {
      data.password = await bcrypt.hash(validationResult.data.password, 10);
    }

    if (validationResult.data.role !== undefined) {
      data.role = validationResult.data.role;
    }

    if (validationResult.data.status !== undefined) {
      data.status = validationResult.data.status;
      // Auto-verify email if status is ACTIVE
      if (validationResult.data.status === "ACTIVE") {
        data.emailVerified = true;
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data,
    });

    revalidatePath("/dashboard/admin/users");
    revalidatePath(`/dashboard/admin/users/${userId}`);

    return {
      success: true,
      message: "User updated successfully",
    };
  } catch (error: any) {
    console.error("Update user error:", error);
    return {
      success: false,
      error: error.message || "Failed to update user",
    };
  }
}

/**
 * Delete user (admin only)
 */
export async function deleteUserAdmin(userId: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    // Don't allow deleting yourself
    const currentUser = await requireRole("ADMIN");
    if (currentUser.id === userId) {
      return {
        success: false,
        error: "You cannot delete your own account",
      };
    }

    // Delete all sessions first
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Delete user (cascading deletes will handle related data)
    await prisma.user.delete({
      where: { id: userId },
    });

    revalidatePath("/dashboard/admin/users");

    return {
      success: true,
      message: "User deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete user error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete user",
    };
  }
}

/**
 * Update user status (admin only)
 */
export async function updateUserStatusAdmin(
  userId: string,
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED"
): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    const data: any = { status };
    if (status === "ACTIVE") {
      data.emailVerified = true;
    }

    await prisma.user.update({
      where: { id: userId },
      data,
    });

    revalidatePath("/dashboard/admin/users");
    revalidatePath(`/dashboard/admin/users/${userId}`);

    return {
      success: true,
      message: "User status updated successfully",
    };
  } catch (error: any) {
    console.error("Update user status error:", error);
    return {
      success: false,
      error: error.message || "Failed to update user status",
    };
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRoleAdmin(
  userId: string,
  role: "USER" | "AGENT" | "ADMIN" | "MODERATOR"
): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    // Don't allow changing your own role
    const currentUser = await requireRole("ADMIN");
    if (currentUser.id === userId) {
      return {
        success: false,
        error: "You cannot change your own role",
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    revalidatePath("/dashboard/admin/users");
    revalidatePath(`/dashboard/admin/users/${userId}`);

    return {
      success: true,
      message: "User role updated successfully",
    };
  } catch (error: any) {
    console.error("Update user role error:", error);
    return {
      success: false,
      error: error.message || "Failed to update user role",
    };
  }
}

/**
 * Bulk update user status (admin only)
 */
export async function bulkUpdateUserStatusAdmin(
  userIds: string[],
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED"
): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");

    const data: any = { status };
    if (status === "ACTIVE") {
      data.emailVerified = true;
    }

    await prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data,
    });

    revalidatePath("/dashboard/admin/users");

    return {
      success: true,
      message: `${userIds.length} user(s) status updated successfully`,
    };
  } catch (error: any) {
    console.error("Bulk update user status error:", error);
    return {
      success: false,
      error: error.message || "Failed to update user status",
    };
  }
}
