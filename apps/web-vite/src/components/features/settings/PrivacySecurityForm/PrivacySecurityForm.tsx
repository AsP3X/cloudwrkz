import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  privacySettingsSchema,
  type PrivacySettingsInput,
} from "@/lib/validations/settings";

interface PrivacySecurityFormProps {
  children?: React.ReactNode;
}

export const PrivacySecurityForm = ({ children }: PrivacySecurityFormProps) => {
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrivacySettingsInput>({
    resolver: zodResolver(privacySettingsSchema),
    defaultValues: {
      profileVisibility: "private",
      showEmail: false,
      showLastSeen: true,
      twoFactorEnabled: false,
    },
  });

  const onSubmit = async (_data: PrivacySettingsInput) => {
    setError(null);
    setSuccess(null);

    try {
      // TODO: Implement privacy settings API endpoint
      setError("Privacy settings update functionality is not yet implemented.");
    } catch (error) {
      console.error("Privacy settings update error:", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
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

      {/* Profile Visibility */}
      <Select
        label="Profile Visibility"
        options={[
          { value: "public", label: "Public" },
          { value: "private", label: "Private" },
          { value: "friends", label: "Friends Only" },
        ]}
        error={errors.profileVisibility?.message}
        helperText="Control who can view your profile"
        {...register("profileVisibility")}
      />

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Privacy Options
        </h3>
        <div className="space-y-4">
          {/* Show Email */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="showEmail"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Show Email Address
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Allow others to see your email address on your profile
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="showEmail"
                className="sr-only peer"
                {...register("showEmail", { valueAsNumber: false })}
              />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {/* Show Last Seen */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="showLastSeen"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Show Last Seen
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Display when you were last active on your profile
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="showLastSeen"
                className="sr-only peer"
                {...register("showLastSeen", { valueAsNumber: false })}
              />
              <div className="w-11 h-6 bg-neutral-200 dark:bg-neutral-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 dark:after:border-neutral-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Optional nested content (e.g., login sessions) */}
      {children}

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Security Options
        </h3>
        <div className="space-y-4">
          {/* Two-Factor Authentication */}
          <div className="flex items-start justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="flex-1">
              <label
                htmlFor="twoFactorEnabled"
                className="text-sm font-medium text-neutral-900 dark:text-neutral-100 block mb-1"
              >
                Two-Factor Authentication
              </label>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Add an extra layer of security to your account
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                id="twoFactorEnabled"
                className="sr-only peer"
                {...register("twoFactorEnabled", { valueAsNumber: false })}
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
          {isSubmitting ? "Saving..." : "Save Privacy Settings"}
        </Button>
      </div>
    </form>
  );
};
