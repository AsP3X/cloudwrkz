import { z } from "zod";

/**
 * Change password schema
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be less than 128 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Change email schema
 */
export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .email("Please enter a valid email address")
    .toLowerCase()
    .trim()
    .max(255, "Email must be less than 255 characters"),
  password: z.string().min(1, "Password is required to change email"),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/**
 * Preferences schema
 */
export const preferencesSchema = z.object({
  language: z.enum(["en", "es", "fr", "de"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  timezone: z
    .enum([
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
    ])
    .optional(),
  timerWidgetMobileMode: z.enum(["dialog", "floating"]).optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

/**
 * Privacy settings schema
 */
export const privacySettingsSchema = z.object({
  profileVisibility: z.enum(["public", "private", "friends"]).optional(),
  showEmail: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

