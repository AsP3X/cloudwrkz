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
 * Valid timezone values from the preferences schema
 */
const VALID_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

type ValidTimezone = (typeof VALID_TIMEZONES)[number];

/**
 * Validate and normalize timezone value
 */
function validateTimezone(timezone: string | null | undefined): ValidTimezone {
  if (!timezone) return "UTC";
  return VALID_TIMEZONES.includes(timezone as ValidTimezone)
    ? (timezone as ValidTimezone)
    : "UTC";
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

