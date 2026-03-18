import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/settings";
import { api } from "@/api/client";

interface ProfileFormProps {
  initialData: {
    name: string | null;
    bio: string | null;
  };
  onSaved?: () => void;
}

export const ProfileForm = ({ initialData, onSaved }: ProfileFormProps) => {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: initialData.name || "",
      bio: initialData.bio || "",
    },
  });

  const onSubmit = async (data: UpdateProfileInput) => {
    setServerError(null);
    setSuccessMessage(null);

    try {
      await api.patch("/profile", {
        name: data.name?.trim() || null,
        bio: data.bio?.trim() || null,
      });
      setSuccessMessage("Profile updated successfully");
      onSaved?.();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Profile update error:", error);
      setServerError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="space-y-6"
      noValidate
    >
      {/* Server Error Message */}
      {serverError && (
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
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{serverError}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
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
            <p className="text-sm font-medium text-success-800 dark:text-success-200">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Name Field */}
      <Input
        label="Full Name"
        type="text"
        placeholder="John Doe"
        error={errors.name?.message}
        helperText="Your display name (2-100 characters)"
        {...register("name")}
      />

      {/* Bio Field */}
      <Textarea
        label="Bio"
        placeholder="Tell us a little about yourself..."
        error={errors.bio?.message}
        helperText="A brief description about yourself (max 500 characters)"
        rows={6}
        {...register("bio")}
      />

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-4 pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
};
