"use server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, DatabaseConnectionError } from "@/lib/utils/auth-server";
import { isDatabaseConnectionError } from "@/lib/utils/db-health";

/**
 * Get the current user's theme preference from the database
 * Returns "system" if not authenticated or no preference is set
 */
export async function getUserTheme(): Promise<"light" | "dark" | "system"> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return "system";
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { theme: true },
    });

    const theme = dbUser?.theme;
    if (theme && ["light", "dark", "system"].includes(theme)) {
      return theme as "light" | "dark" | "system";
    }

    return "system";
  } catch (error) {
    // If it's a database connection error, return "system" instead of throwing
    // The layout already checks database availability before calling this function
    if (isDatabaseConnectionError(error) || error instanceof DatabaseConnectionError) {
      console.warn("Database unavailable, using default theme");
      return "system";
    }
    console.error("Error getting user theme:", error);
    return "system";
  }
}

/**
 * Update the current user's theme preference in the database
 */
export async function updateUserTheme(theme: "light" | "dark" | "system"): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Validate theme value
    if (!["light", "dark", "system"].includes(theme)) {
      return { success: false, error: "Invalid theme value" };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { theme },
    });

    return { success: true };
  } catch (error) {
    if (isDatabaseConnectionError(error) || error instanceof DatabaseConnectionError) {
      return { success: false, error: "Database is not available" };
    }
    console.error("Error updating user theme:", error);
    return { success: false, error: "Failed to update theme" };
  }
}
