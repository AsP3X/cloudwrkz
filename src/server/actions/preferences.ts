"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import {
  preferencesSchema,
  type PreferencesInput,
} from "@/lib/validations/settings";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Get current user preferences
 */
export async function getPreferences() {
  const user = await requireAuth();

  // For now, we'll store theme preference in localStorage on client side
  // But we can extend this to fetch from database if needed in the future
  // This is a placeholder that returns default preferences
  return {
    theme: "system" as const,
    language: "en" as const,
    emailNotifications: true,
    pushNotifications: false,
    marketingEmails: false,
  };
}

/**
 * Update user preferences
 * Note: Theme preference is stored in localStorage on client side for immediate effect
 * Other preferences can be stored in the database when User model is extended
 */
export async function updatePreferences(
  input: PreferencesInput
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Validate input
    const validationResult = preferencesSchema.safeParse(input);

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

    const { theme, language, emailNotifications, pushNotifications, marketingEmails, timezone } =
      validationResult.data;

    // Persist timezone preference on the user record
    if (timezone) {
      await prisma.user.update({
        where: { id: user.id },
        data: { timezone },
      });
    }

    // Revalidate settings page
    revalidatePath("/dashboard/settings");

    return {
      success: true,
      message: "Preferences updated successfully",
    };
  } catch (error) {
    console.error("Preferences update error:", error);

    return {
      success: false,
      error: "An error occurred while updating preferences. Please try again.",
    };
  }
}

