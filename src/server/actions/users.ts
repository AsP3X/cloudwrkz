"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import type { UpdateProfileInput } from "@/lib/validations/auth";

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
