"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type SessionFilters = {
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type SessionWithUser = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
   deviceId: string | null;
   deviceName: string | null;
   deviceType: string | null;
   deviceOs: string | null;
   deviceBrowser: string | null;
   userAgent: string | null;
   ipAddress: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
  };
};

/**
 * Get all active sessions with user details (admin only)
 */
export async function getAllSessionsAdmin(filters: SessionFilters = {}) {
  await requireRole("ADMIN");
  const { requirePermission } = await import("@/lib/utils/auth-server");
  await requirePermission("admin.sessions.view");

  const {
    userId,
    search,
    page = 1,
    limit = 50,
  } = filters;

  const skip = (page - 1) * limit;

  const where: any = {
    expiresAt: {
      gt: new Date(), // Only active (non-expired) sessions
    },
  };

  if (userId) {
    where.userId = userId;
  }

  if (search) {
    where.user = {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      select: {
        id: true,
        token: true,
        userId: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        deviceId: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        userAgent: true,
        ipAddress: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.session.count({ where }),
  ]);

  return {
    sessions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Delete a session by ID (admin only)
 */
export async function deleteSessionAdmin(sessionId: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    const { requirePermission } = await import("@/lib/utils/auth-server");
    await requirePermission("admin.sessions.view");

    await prisma.session.delete({
      where: { id: sessionId },
    });

    revalidatePath("/dashboard/admin/sessions");

    return {
      success: true,
      message: "Session deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete session error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete session",
    };
  }
}

/**
 * Delete all sessions for a user (admin only)
 */
export async function deleteUserSessionsAdmin(userId: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    const { requirePermission } = await import("@/lib/utils/auth-server");
    await requirePermission("admin.sessions.view");

    await prisma.session.deleteMany({
      where: { userId },
    });

    revalidatePath("/dashboard/admin/sessions");

    return {
      success: true,
      message: "All sessions for user deleted successfully",
    };
  } catch (error: any) {
    console.error("Delete user sessions error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete user sessions",
    };
  }
}

/**
 * Delete all expired sessions (admin only)
 */
export async function deleteExpiredSessionsAdmin(): Promise<ActionResult<{ count: number }>> {
  try {
    await requireRole("ADMIN");
    const { requirePermission } = await import("@/lib/utils/auth-server");
    await requirePermission("admin.sessions.view");

    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    revalidatePath("/dashboard/admin/sessions");

    return {
      success: true,
      data: { count: result.count },
      message: `${result.count} expired session(s) deleted successfully`,
    };
  } catch (error: any) {
    console.error("Delete expired sessions error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete expired sessions",
    };
  }
}
