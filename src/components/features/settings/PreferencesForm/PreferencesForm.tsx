"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  preferencesSchema,
  type PreferencesInput,
} from "@/lib/validations/settings";

export const PreferencesForm = () => {
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      language: "en",
      theme: "system",
      emailNotifications: true,
      pushNotifications: false,
      marketingEmails: false,
    },
  });

  const onSubmit = async (data: PreferencesInput) => {
    setError(null);
    setSuccess(null);

    try {
      // TODO: Implement updatePreferences server action
      // const result = await updatePreferences(data);
      // if (result.success) {
      //   setSuccess(result.message || "Preferences updated successfully");
      //   setTimeout(() => setSuccess(null), 3000);
      // } else {
      //   setError(result.error || "Failed to update preferences. Please try again.");
      // }
      setError("Preferences update functionality is not yet implemented.");
    } catch (error) {
      console.error("Preferences update error:", error);
      setError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 mt-0.5 flex-shrink-0"
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
            <p className="text-sm font-medium text-error-800">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 border-2 border-success-200 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 mt-0.5 flex-shrink-0"
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
            <p className="text-sm font-medium text-success-800">{success}</p>
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
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-200 pt-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Notification Preferences
        </h3>
        <div className="space-y-4">
          {/* Email Notifications */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex-1">
              <label
                htmlFor="emailNotifications"
                className="text-sm font-medium text-neutral-900 block mb-1"
              >
                Email Notifications
              </label>
              <p className="text-sm text-neutral-600">
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
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Push Notifications */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex-1">
              <label
                htmlFor="pushNotifications"
                className="text-sm font-medium text-neutral-900 block mb-1"
              >
                Push Notifications
              </label>
              <p className="text-sm text-neutral-600">
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
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Marketing Emails */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 rounded-lg border border-neutral-200">
            <div className="flex-1">
              <label
                htmlFor="marketingEmails"
                className="text-sm font-medium text-neutral-900 block mb-1"
              >
                Marketing Emails
              </label>
              <p className="text-sm text-neutral-600">
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
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
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

