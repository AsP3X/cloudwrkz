"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Get all agents for ticket assignment
 * Returns users with AGENT, ADMIN, or MODERATOR roles
 * Includes ACTIVE and PENDING users (excludes SUSPENDED and DELETED)
 */
export async function getAgents() {
  await requireAuth();

  const agents = await prisma.user.findMany({
    where: {
      role: {
        in: ["AGENT", "ADMIN", "MODERATOR"],
      },
      status: {
        in: ["ACTIVE", "PENDING"], // Include both ACTIVE and PENDING users
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: [
      { role: "asc" }, // ADMIN first, then MODERATOR, then AGENT
      { name: "asc" },
      { email: "asc" },
    ],
  });

  return agents;
}

/**
 * Get all users for filtering (for agents/admins)
 * Returns all active users
 */
export async function getAllUsers() {
  await requireAuth();

  const users = await prisma.user.findMany({
    where: {
      status: {
        in: ["ACTIVE", "PENDING"],
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
    orderBy: [
      { name: "asc" },
      { email: "asc" },
    ],
  });

  return users;
}

/**
 * Get current user's full profile data
 */
export async function getCurrentUserProfile() {
  const user = await requireAuth();

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
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
    },
  });

  return profile;
}

/**
 * Update current user's profile
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Validate input
    const validationResult = updateProfileSchema.safeParse(input);

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

    const { name, bio } = validationResult.data;

    // Prepare update data - convert empty strings to null
    const updateData: {
      name?: string | null;
      bio?: string | null;
    } = {};

    if (name !== undefined) {
      updateData.name = name === "" ? null : name;
    }
    if (bio !== undefined) {
      updateData.bio = bio === "" ? null : bio;
    }

    // Update user profile
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Revalidate profile page
    revalidatePath("/dashboard/profile");

    return {
      success: true,
      message: "Profile updated successfully",
    };
  } catch (error) {
    console.error("Profile update error:", error);

    return {
      success: false,
      error: "An error occurred while updating your profile. Please try again.",
    };
  }
}
