"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  preferencesSchema,
  type PreferencesInput,
} from "@/lib/validations/settings";
import { updatePreferences } from "@/server/actions/preferences";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useTimerWidgetPreference, getTimerWidgetPreference } from "@/lib/hooks/useTimerWidgetPreference";
import { COMMON_TIMEZONES } from "@/lib/constants/timezones";
import { getServerActionErrorMessage } from "@/lib/utils/server-action-utils";

type PreferencesFormProps = {
  initialValues?: Partial<PreferencesInput>;
};

export const PreferencesForm = ({ initialValues }: PreferencesFormProps) => {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  
  // Track if we're syncing from context to prevent feedback loop
  const isSyncingFromContext = React.useRef(false);
  const isSyncingTimerFromContext = React.useRef(false);
  
  // Initialize theme with safe default to avoid hydration mismatch
  // Will be updated after mount from localStorage
  const [initialTheme, setInitialTheme] = React.useState<"light" | "dark" | "system">("system");
  
  // Get theme - will throw if ThemeProvider is not available, but it should be in root layout
  const { theme, setTheme } = useTheme();
  const { preference: timerWidgetPreference, setPreference: setTimerWidgetPreference } = useTimerWidgetPreference();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
    getValues,
  } = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      language: initialValues?.language ?? "en",
      theme: initialTheme, // Use theme from localStorage directly to prevent flash
      emailNotifications: initialValues?.emailNotifications ?? true,
      pushNotifications: initialValues?.pushNotifications ?? false,
      marketingEmails: initialValues?.marketingEmails ?? false,
      timezone: initialValues?.timezone ?? "UTC",
      // Use stable default "dialog" to avoid hydration mismatch (getTimerWidgetPreference reads localStorage)
      timerWidgetMobileMode: initialValues?.timerWidgetMobileMode ?? "dialog",
    },
  });

  // Mark as mounted and load theme + timer widget preference from localStorage after initial render
  React.useEffect(() => {
    setMounted(true);
    // Load theme from localStorage after mount to prevent hydration mismatch
    try {
      const stored = localStorage.getItem("theme");
      if (stored && ["light", "dark", "system"].includes(stored)) {
        const themeValue = stored as "light" | "dark" | "system";
        setInitialTheme(themeValue);
        setValue("theme", themeValue);
      }
    } catch {
      // Ignore localStorage errors
    }
    // Sync timer widget preference from localStorage (client-only, avoids hydration mismatch)
    setValue("timerWidgetMobileMode", getTimerWidgetPreference());
  }, [setValue]);

  // Reset form when initialValues change (e.g., after successful save and page revalidation)
  // Note: theme is excluded because it's stored in localStorage on client side, not on server
  React.useEffect(() => {
    if (initialValues && mounted) {
      // Get current theme from localStorage to avoid flash
      let currentTheme: "light" | "dark" | "system" = "system";
      try {
        const stored = localStorage.getItem("theme");
        if (stored && ["light", "dark", "system"].includes(stored)) {
          currentTheme = stored as "light" | "dark" | "system";
        }
      } catch {
        // Ignore localStorage errors
      }
      
      reset({
        language: initialValues.language ?? "en",
        theme: currentTheme, // Always use theme from localStorage, not from server
        emailNotifications: initialValues.emailNotifications ?? true,
        pushNotifications: initialValues.pushNotifications ?? false,
        marketingEmails: initialValues.marketingEmails ?? false,
        timezone: initialValues.timezone ?? "UTC",
        timerWidgetMobileMode: initialValues.timerWidgetMobileMode ?? getTimerWidgetPreference(),
      });
    }
  }, [initialValues, reset, mounted]);

  // Sync form value with theme from context when theme changes externally
  // Only update if the form value is different to prevent unnecessary re-renders
  // This handles cases where theme changes outside the form (e.g., from another component)
  React.useEffect(() => {
    if (mounted && theme) {
      const currentFormTheme = getValues("theme");
      if (currentFormTheme !== theme) {
        isSyncingFromContext.current = true;
        setValue("theme", theme, { shouldDirty: false });
        // Reset the flag after a microtask to allow the watch effect to see it
        requestAnimationFrame(() => {
          isSyncingFromContext.current = false;
        });
      }
    }
  }, [theme, setValue, mounted, getValues]);

  // Sync form value with timer widget preference when it changes externally
  // Only update when form value differs to avoid triggering the watch effect unnecessarily
  React.useEffect(() => {
    if (!mounted) return;
    const current = getValues("timerWidgetMobileMode");
    if (current === timerWidgetPreference) return;
    isSyncingTimerFromContext.current = true;
    setValue("timerWidgetMobileMode", timerWidgetPreference, { shouldDirty: false });
    requestAnimationFrame(() => {
      isSyncingTimerFromContext.current = false;
    });
  }, [timerWidgetPreference, setValue, mounted, getValues]);

  // Watch theme changes and apply immediately
  // Skip if we're syncing from context to prevent feedback loop
  // eslint-disable-next-line react-hooks/incompatible-library
  const watchedTheme = watch("theme");
  React.useEffect(() => {
    if (mounted && watchedTheme && watchedTheme !== theme && setTheme && !isSyncingFromContext.current) {
      setTheme(watchedTheme as "light" | "dark" | "system");
    }
  }, [watchedTheme, theme, setTheme, mounted]);

  // Watch timer widget preference changes and apply immediately (skip when syncing from context)
  const watchedTimerWidgetMode = watch("timerWidgetMobileMode");
  React.useEffect(() => {
    if (
      watchedTimerWidgetMode &&
      watchedTimerWidgetMode !== timerWidgetPreference &&
      !isSyncingTimerFromContext.current
    ) {
      setTimerWidgetPreference(watchedTimerWidgetMode as "dialog" | "floating");
    }
  }, [watchedTimerWidgetMode, timerWidgetPreference, setTimerWidgetPreference]);

  const onSubmit = async (data: PreferencesInput) => {
    setError(null);
    setSuccess(null);

    try {
      // Apply theme immediately via context
      if (data.theme && data.theme !== theme && setTheme) {
        setTheme(data.theme as "light" | "dark" | "system");
      }

      // Apply timer widget preference immediately
      if (data.timerWidgetMobileMode && data.timerWidgetMobileMode !== timerWidgetPreference) {
        setTimerWidgetPreference(data.timerWidgetMobileMode as "dialog" | "floating");
      }

      // Save preferences to server
      const result = await updatePreferences(data);
      if (result.success) {
        setSuccess(result.message || "Preferences updated successfully");
        setTimeout(() => setSuccess(null), 3000);
        // Refresh the page to get updated user data (especially timezone)
        router.refresh();
      } else {
        setError(result.error || "Failed to update preferences. Please try again.");
      }
    } catch (error) {
      console.error("Preferences update error:", error);
      setError(getServerActionErrorMessage(error, "An unexpected error occurred. Please try again."));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Language */}
        <Select
          label="Language"
          options={[
            { value: "en", label: "English" },
            { value: "es", label: "Spanish" },
            { value: "fr", label: "French" },
            { value: "de", label: "German" },
          ]}
          error={errors.language?.message}
          helperText="Select your preferred language"
          {...register("language")}
        />

        {/* Theme */}
        <Select
          label="Theme"
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
          error={errors.theme?.message}
          helperText="Choose your preferred theme"
          {...register("theme")}
        />

        {/* Timezone */}
        <Select
          label="Time Zone"
          options={COMMON_TIMEZONES.map((tz) => ({
            value: tz.value,
            label: tz.label,
          }))}
          error={errors.timezone?.message}
          helperText="Choose your preferred time zone for displaying dates and times"
          {...register("timezone")}
        />

        {/* Timer Widget Mode */}
        <Select
          label="Timer Widget Display"
          options={[
            { value: "dialog", label: "Dialog" },
            { value: "floating", label: "Floating Widget" },
          ]}
          error={errors.timerWidgetMobileMode?.message}
          helperText="Choose how the timer widget appears when opened (applies to all devices)"
          {...register("timerWidgetMobileMode")}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Notification Preferences
        </h3>
        <div className="space-y-4">
          {/* Email Notifications */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="emailNotifications"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Email Notifications
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Receive email notifications about important account activities
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="emailNotifications"
                className="sr-only peer"
                {...register("emailNotifications", { valueAsNumber: false })}
              />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Push Notifications */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="pushNotifications"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Push Notifications
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Receive push notifications in your browser
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="pushNotifications"
                className="sr-only peer"
                {...register("pushNotifications", { valueAsNumber: false })}
              />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Marketing Emails */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="marketingEmails"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Marketing Emails
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Receive emails about new features, tips, and promotional offers
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="marketingEmails"
                className="sr-only peer"
                {...register("marketingEmails", { valueAsNumber: false })}
              />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-4 pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </form>
  );
};

