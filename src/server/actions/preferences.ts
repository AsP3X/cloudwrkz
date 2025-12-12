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
 * Validate and normalize timezone value
 * Accepts any valid IANA timezone string
 */
function validateTimezone(timezone: string | null | undefined): string {
  if (!timezone) return "UTC";
  // Basic validation: IANA timezone format (Area/Location or Area/SubArea/Location)
  if (/^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/.test(timezone) || timezone === "UTC") {
    return timezone;
  }
  return "UTC";
}

/**
 * Get current user preferences
 */
export async function getPreferences() {
  const user = await requireAuth();

  // Fetch user preferences from database
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      timezone: true,
      theme: true,
    },
  });

  // Validate theme value
  const theme = dbUser?.theme && ["light", "dark", "system"].includes(dbUser.theme)
    ? (dbUser.theme as "light" | "dark" | "system")
    : "system";

  return {
    theme,
    language: "en" as const,
    emailNotifications: true,
    pushNotifications: false,
    marketingEmails: false,
    timezone: validateTimezone(dbUser?.timezone),
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

    // Prepare update data
    const updateData: { timezone?: string; theme?: string } = {};
    
    // Update timezone if provided
    if (timezone !== undefined) {
      updateData.timezone = timezone ?? "UTC";
    }
    
    // Update theme if provided
    if (theme !== undefined) {
      // Validate theme value
      const validTheme = ["light", "dark", "system"].includes(theme) ? theme : "system";
      updateData.theme = validTheme;
    }

    // Persist preferences on the user record
    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Revalidate settings page and time tracking pages (timezone affects date displays)
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/time-tracking");

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

