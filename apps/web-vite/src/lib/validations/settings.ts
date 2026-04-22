// Human: Account settings form validation for password rotation, email change, and saved preferences fields.
// Agent: Zod objects with refine cross-field checks; EXPORTS changePasswordSchema changeEmailSchema preferencesSchema types.

import { z } from "zod";

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

export const preferencesSchema = z.object({
  language: z.enum(["en", "es", "fr", "de"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  timezone: z
    .string()
    .refine(
      (tz) => {
        if (!tz) return true;
        return /^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/.test(tz) || tz === "UTC";
      },
      { message: "Invalid timezone format" }
    )
    .optional(),
  timerWidgetMobileMode: z.enum(["dialog", "floating"]).optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const privacySettingsSchema = z.object({
  profileVisibility: z.enum(["public", "private", "friends"]).optional(),
  showEmail: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  bio: z
    .string()
    .max(500, "Bio must be less than 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
