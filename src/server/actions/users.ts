"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

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
 * Get user by ID with ticket counts (for agents/admins/moderators)
 */
export async function getUserById(userId: string) {
  const currentUser = await requireAuth();

  // Only agents, admins, and moderators can view other users
  if (currentUser.role !== "AGENT" && currentUser.role !== "ADMIN" && currentUser.role !== "MODERATOR") {
    throw new Error("Forbidden: Insufficient permissions");
  }

  const user = await prisma.user.findUnique({
    where: { 
      id: userId,
    },
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
      _count: {
        select: {
          createdTickets: true,
          assignedTickets: true,
        },
      },
    },
  });

  return user;
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

/**
 * Flag current user's account for deletion (soft delete)
 * Sets status to DELETED and scheduledForDeletionAt to now
 * The account will be permanently purged after 30 days by the purge-deleted-accounts cron job
 * Cascading deletes will handle:
 * - Sessions (already deleted explicitly)
 * - Tickets created by user (will be deleted when account is purged)
 * - Ticket comments by user (will be deleted when account is purged)
 * - Group memberships (will be deleted when account is purged)
 * - Assigned tickets will be unassigned (SetNull)
 */
export async function flagAccountForDeletion(): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get user ID before deletion
    const userId = user.id;

    // Delete all user sessions first to log them out immediately
    await prisma.session.deleteMany({
      where: { userId },
    });

    // Clear the session cookie
    const cookieStore = await cookies();
    cookieStore.delete("session");

    // Soft delete: Set status to DELETED and schedule for deletion
    // The account will be permanently purged after 30 days by the purge-deleted-accounts cron job
    // Free up the email by modifying it and storing the original
    const timestamp = Date.now();
    const deletedEmail = `${user.email}_deleted_${userId}_${timestamp}`;
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        scheduledForDeletionAt: new Date(),
        originalEmail: user.email,
        email: deletedEmail,
      },
      select: {
        id: true,
        email: true,
        originalEmail: true,
        status: true,
        scheduledForDeletionAt: true,
      },
    });

    console.log("User flagged for deletion:", {
      id: updatedUser.id,
      email: updatedUser.email,
      status: updatedUser.status,
      scheduledForDeletionAt: updatedUser.scheduledForDeletionAt,
    });

    // Revalidate settings page
    revalidatePath("/dashboard/settings");

    return {
      success: true,
      message: "Your account has been flagged for deletion. It will be permanently removed after 30 days.",
    };
  } catch (error) {
    console.error("Account deletion error:", error);
    console.error("Error details:", error instanceof Error ? error.stack : error);

    return {
      success: false,
      error: error instanceof Error ? `An error occurred: ${error.message}` : "An error occurred while deleting your account. Please try again.",
    };
  }
}
