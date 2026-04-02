import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  changePasswordSchema,
  changeEmailSchema,
  type ChangePasswordInput,
  type ChangeEmailInput,
} from "@/lib/validations/settings";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";

interface AccountSettingsFormProps {
  currentEmail: string;
  emailVerified: boolean;
  onSaved?: () => void;
}

export const AccountSettingsForm = ({
  currentEmail,
  emailVerified,
  onSaved,
}: AccountSettingsFormProps) => {
  const { refreshUser } = useAuth();
  const [activeTab, setActiveTab] = React.useState<"email" | "password">("email");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);

  const {
    register: registerEmail,
    handleSubmit: handleEmailSubmit,
    formState: { errors: emailErrors, isSubmitting: isEmailSubmitting },
  } = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: {
      newEmail: "",
      password: "",
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
    reset: resetPassword,
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onEmailSubmit = async (_data: ChangeEmailInput) => {
    setEmailError(null);
    setEmailSuccess(null);

    try {
      setEmailError("Email change functionality is not yet implemented.");
    } catch (error) {
      console.error("Email change error:", error);
      setEmailError("An unexpected error occurred. Please try again.");
    }
  };

  const onPasswordSubmit = async (data: ChangePasswordInput) => {
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const res = await api.post<{ message?: string; token?: string }>("/auth/change-password", {
        current_password: data.currentPassword,
        new_password: data.newPassword,
        confirm_password: data.confirmPassword,
      });
      if (res.token) {
        localStorage.setItem("auth_token", res.token);
      }
      await refreshUser();
      setPasswordSuccess("Password changed successfully");
      resetPassword();
      onSaved?.();
      setTimeout(() => setPasswordSuccess(null), 5000);
    } catch (error) {
      console.error("Password change error:", error);
      setPasswordError(
        error instanceof Error ? error.message : "An unexpected error occurred. Please try again."
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <nav className="flex gap-6 -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "email"
                ? "border-primary-600 dark:border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300 dark:hover:border-neutral-700"
            }`}
          >
            Change Email
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("password")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "password"
                ? "border-primary-600 dark:border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:border-neutral-300 dark:hover:border-neutral-700"
            }`}
          >
            Change Password
          </button>
        </nav>
      </div>

      {/* Email Change Form */}
      {activeTab === "email" && (
        <form
          onSubmit={handleEmailSubmit(onEmailSubmit)}
          className="space-y-6"
          noValidate
        >
          {/* Current Email Display */}
          <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1 block">
              Current Email
            </span>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{currentEmail}</p>
              {emailVerified ? (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-300 border border-success-200 dark:border-success-800">
                  Verified
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
                  Not Verified
                </span>
              )}
            </div>
          </div>

          {/* Error Message */}
          {emailError && (
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
                <p className="text-sm font-medium text-error-800 dark:text-error-200">{emailError}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {emailSuccess && (
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
                <p className="text-sm font-medium text-success-800 dark:text-success-200">{emailSuccess}</p>
              </div>
            </div>
          )}

          <Input
            label="New Email Address"
            type="email"
            placeholder="newemail@example.com"
            error={emailErrors.newEmail?.message}
            helperText="We'll send a verification email to your new address"
            required
            {...registerEmail("newEmail")}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Enter your current password"
            error={emailErrors.password?.message}
            helperText="Enter your current password to confirm this change"
            required
            {...registerEmail("password")}
          />

          <div className="flex items-center justify-end gap-4 pt-4">
            <Button
              type="submit"
              variant="primary"
              disabled={isEmailSubmitting}
              loading={isEmailSubmitting}
            >
              {isEmailSubmitting ? "Sending..." : "Change Email"}
            </Button>
          </div>
        </form>
      )}

      {/* Password Change Form */}
      {activeTab === "password" && (
        <form
          onSubmit={handlePasswordSubmit(onPasswordSubmit)}
          className="space-y-6"
          noValidate
        >
          {/* Error Message */}
          {passwordError && (
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
                <p className="text-sm font-medium text-error-800 dark:text-error-200">{passwordError}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {passwordSuccess && (
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
                <p className="text-sm font-medium text-success-800 dark:text-success-200">{passwordSuccess}</p>
              </div>
            </div>
          )}

          <Input
            label="Current Password"
            type="password"
            placeholder="Enter your current password"
            error={passwordErrors.currentPassword?.message}
            required
            {...registerPassword("currentPassword")}
          />

          <Input
            label="New Password"
            type="password"
            placeholder="Enter your new password"
            error={passwordErrors.newPassword?.message}
            helperText="Must be at least 8 characters with uppercase, lowercase, and number"
            required
            {...registerPassword("newPassword")}
          />

          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Confirm your new password"
            error={passwordErrors.confirmPassword?.message}
            required
            {...registerPassword("confirmPassword")}
          />

          <div className="flex items-center justify-end gap-4 pt-4">
            <Button
              type="submit"
              variant="primary"
              disabled={isPasswordSubmitting}
              loading={isPasswordSubmitting}
            >
              {isPasswordSubmitting ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
