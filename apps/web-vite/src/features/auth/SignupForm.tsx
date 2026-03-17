import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { useAuth } from "@/components/providers/AuthProvider";

type SignupFormProps = {
  disabled?: boolean;
};

export function SignupForm({ disabled = false }: SignupFormProps) {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      agreeToTerms: false,
    },
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    setSuccessMessage(null);

    const result = await registerUser(data);

    if (result.success) {
      setSuccessMessage(
        "Account created successfully! Please check your email to verify your account."
      );
      setTimeout(() => {
        navigate(ROUTES.LOGIN);
      }, 3000);
    } else {
      if (result.error) {
        setServerError(result.error);
      }
    }
  };

  return (
    <form
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
      {...(disabled && { "aria-disabled": true })}
    >
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
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">
                {successMessage}
              </p>
              <p className="mt-1 text-sm text-success-700 dark:text-success-300">
                Redirecting to login page...
              </p>
            </div>
          </div>
        </div>
      )}

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

      <Input
        label="Full Name"
        type="text"
        placeholder="John Doe"
        error={errors.name?.message}
        required
        disabled={disabled}
        {...register("name")}
      />

      <Input
        label="Email Address"
        type="email"
        placeholder="john@example.com"
        error={errors.email?.message}
        helperText="We'll never share your email with anyone else."
        required
        disabled={disabled}
        {...register("email")}
      />

      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        error={errors.password?.message}
        helperText="Must be at least 8 characters with uppercase, lowercase, and number"
        required
        disabled={disabled}
        {...register("password")}
      />

      <Input
        label="Confirm Password"
        type="password"
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        required
        disabled={disabled}
        {...register("confirmPassword")}
      />

      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id="agreeToTerms"
            type="checkbox"
            className="w-4 h-4 text-primary-600 dark:text-primary-500 border-neutral-300 dark:border-neutral-700 rounded focus:ring-primary-500 focus:ring-2 bg-white dark:bg-neutral-900"
            disabled={disabled}
            {...register("agreeToTerms")}
          />
        </div>
        <div className="ml-3 text-sm">
          <label htmlFor="agreeToTerms" className="text-neutral-700 dark:text-neutral-300">
            I agree to the{" "}
            <Link
              to={ROUTES.TERMS}
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Terms and Conditions
            </Link>{" "}
            and{" "}
            <Link
              to={ROUTES.PRIVACY}
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              Privacy Policy
            </Link>
          </label>
          {errors.agreeToTerms && (
            <p className="mt-1 text-sm text-error-600 dark:text-error-400">
              {errors.agreeToTerms.message}
            </p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={isSubmitting}
        disabled={isSubmitting || disabled}
      >
        {isSubmitting ? "Creating Account..." : "Create Account"}
      </Button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link
          to={ROUTES.LOGIN}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
