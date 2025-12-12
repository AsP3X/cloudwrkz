"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

/**
 * Get view mode preference for a specific module
 */
export async function getViewPreference(moduleName: string): Promise<string | null> {
  try {
    const user = await requireAuth();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        viewPreferences: true,
      },
    });

    if (!dbUser?.viewPreferences || typeof dbUser.viewPreferences !== "object") {
      return null;
    }

    const preferences = dbUser.viewPreferences as Record<string, string>;
    return preferences[moduleName] || null;
  } catch (error) {
    console.error("Error getting view preference:", error);
    return null;
  }
}

/**
 * Save view mode preference for a specific module
 */
export async function saveViewPreference(
  moduleName: string,
  viewMode: string
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        viewPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.viewPreferences as Record<string, string>) || {};

    // Update the preference for this module
    const updatedPreferences = {
      ...currentPreferences,
      [moduleName]: viewMode,
    };

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        viewPreferences: updatedPreferences as any,
      },
    });

    // Revalidate relevant paths
    if (moduleName === "ticket") {
      revalidatePath("/dashboard/tickets");
    } else if (moduleName === "timeEntry") {
      revalidatePath("/dashboard/time-tracking");
    }

    return {
      success: true,
      message: "View preference saved successfully",
    };
  } catch (error) {
    console.error("Error saving view preference:", error);
    return {
      success: false,
      error: "An error occurred while saving view preference. Please try again.",
    };
  }
}
