"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import type { UpdateProfileInput } from "@/lib/validations/auth";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/settings";
import { generateToken, hashPassword, verifyPassword } from "@/lib/utils/auth";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Get all users (for agents to create tickets for users)
 */
export async function getAllUsers() {
  await requireAuth();

  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get all agents (users with AGENT, ADMIN, or MODERATOR roles)
 */
export async function getAgents() {
  await requireAuth();

  return prisma.user.findMany({
    where: {
      role: {
        in: ["AGENT", "ADMIN", "MODERATOR"],
      },
      status: "ACTIVE",
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

/**
 * Get current user's profile
 */
export async function getCurrentUserProfile() {
  const user = await requireAuth();

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      bio: true,
      avatar: true,
      emailVerified: true,
      timezone: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return profile;
}

/**
 * Get user by ID (for viewing other users - agents/admins only)
 */
export async function getUserById(userId: string) {
  const user = await requireAuth();

  // Regular users can only view their own profile
  if (user.role === "USER" && user.id !== userId) {
    return null;
  }

  // Agents/admins/moderators can view any user
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      bio: true,
      avatar: true,
      emailVerified: true,
      timezone: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          createdTickets: true,
          assignedTickets: true,
        },
      },
    },
  });
}

/**
 * Update current user's profile
 */
export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Validate input
    const updateData: {
      name?: string | null;
      bio?: string | null;
    } = {};

    if (input.name !== undefined) {
      if (input.name === "" || input.name.trim().length === 0) {
        updateData.name = null;
      } else {
        const trimmedName = input.name.trim();
        if (trimmedName.length < 2) {
          return {
            success: false,
            error: "Name must be at least 2 characters",
            fieldErrors: { name: ["Name must be at least 2 characters"] },
          };
        }
        if (trimmedName.length > 100) {
          return {
            success: false,
            error: "Name must be less than 100 characters",
            fieldErrors: { name: ["Name must be less than 100 characters"] },
          };
        }
        updateData.name = trimmedName;
      }
    }

    if (input.bio !== undefined) {
      if (input.bio === null || input.bio === "" || input.bio.trim().length === 0) {
        updateData.bio = null;
      } else {
        const trimmedBio = input.bio.trim();
        if (trimmedBio.length > 500) {
          return {
            success: false,
            error: "Bio must be less than 500 characters",
            fieldErrors: { bio: ["Bio must be less than 500 characters"] },
          };
        }
        updateData.bio = trimmedBio;
      }
    }

    // Update user profile
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Revalidate profile and settings pages
    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard/settings");

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error: any) {
    console.error("Update profile error:", error);
    return {
      success: false,
      error: error.message || "Failed to update profile. Please try again.",
    };
  }
}

/**
 * Get user effective permissions (admin only)
 */
export async function getUserEffectivePermissions(userId: string) {
  const { requireRole } = await import("@/lib/utils/auth-server");
  await requireRole("ADMIN");
  
  const { getUserPermissions } = await import("@/lib/utils/permissions");
  const permissions = await getUserPermissions(userId);
  
  return Array.from(permissions);
}

/**
 * Flag account for deletion
 * Sets the user's status to DELETED, which marks the account for deletion
 */
export async function flagAccountForDeletion(): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Update user status to DELETED
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
      },
    });

    // Revalidate relevant paths
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Account flagged for deletion successfully",
    };
  } catch (error: any) {
    console.error("Flag account for deletion error:", error);
    return {
      success: false,
      error: error.message || "Failed to delete account. Please try again.",
    };
  }
}

/**
 * Change the current user's password
 */
export async function changePassword(input: ChangePasswordInput): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Validate input with Zod schema
    const validationResult = changePasswordSchema.safeParse(input);

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

    const { currentPassword, newPassword } = validationResult.data;

    // Load full user with password hash
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        password: true,
        status: true,
      },
    });

    if (!dbUser) {
      return {
        success: false,
        error: "User not found",
      };
    }

    if (dbUser.status !== "ACTIVE") {
      return {
        success: false,
        error: "Your account is not active. Password cannot be changed.",
      };
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, dbUser.password);

    if (!isCurrentPasswordValid) {
      return {
        success: false,
        error: "Current password is incorrect",
        fieldErrors: {
          currentPassword: ["Current password is incorrect"],
        },
      };
    }

    // Hash and update to the new password; revoke all sessions then issue a new one for this browser
    const newHashedPassword = await hashPassword(newPassword);

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;
    if (!sessionToken) {
      return {
        success: false,
        error: "No active session.",
      };
    }

    const existingSession = await prisma.session.findUnique({
      where: { token: sessionToken },
      select: {
        userId: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        userAgent: true,
        ipAddress: true,
      },
    });

    if (!existingSession || existingSession.userId !== dbUser.id) {
      return {
        success: false,
        error: "Session is invalid. Please sign in again.",
      };
    }

    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          password: newHashedPassword,
        },
      });
      await tx.session.deleteMany({ where: { userId: dbUser.id } });
      await tx.session.create({
        data: {
          token: newToken,
          userId: dbUser.id,
          expiresAt,
          deviceName: existingSession.deviceName,
          deviceType: existingSession.deviceType,
          deviceOs: existingSession.deviceOs,
          deviceBrowser: existingSession.deviceBrowser,
          userAgent: existingSession.userAgent,
          ipAddress: existingSession.ipAddress,
        },
      });
    });

    const maxAgeSecs = Math.floor(SESSION_LIFETIME_MS / 1000);
    cookieStore.set("session", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: maxAgeSecs,
      path: "/",
    });

    // Revalidate relevant paths
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/profile");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Password changed successfully.",
    };
  } catch (error: any) {
    console.error("Change password error:", error);

    return {
      success: false,
      error: error?.message || "Failed to change password. Please try again.",
    };
  }
}
