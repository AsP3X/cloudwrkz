import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { useAuth } from "@/components/providers/AuthProvider";

type LoginFormProps = {
  initialError?: string;
  disabled?: boolean;
};

export function LoginForm({ initialError, disabled = false }: LoginFormProps) {
  const navigate = useNavigate();
  const { login } = useAuth();

  const getInitialErrorMessage = (code?: string): string | null => {
    switch (code) {
      case "account_not_verified":
        return "You need to sign in before you can access that page. If you recently created your account, make sure you have completed any required verification steps.";
      case "session_expired":
        return "Your session has expired. Please sign in again to continue.";
      case "logged_out":
        return "You've been signed out. Please sign in again to continue.";
      case "access_denied":
        return "You don't have permission to access that page. Please sign in with a different account or contact an administrator.";
      default:
        return null;
    }
  };

  const [serverError, setServerError] = React.useState<string | null>(() =>
    getInitialErrorMessage(initialError)
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);

    const result = await login(data.email, data.password, data.rememberMe);

    if (result.success) {
      navigate(ROUTES.DASHBOARD);
    } else {
      if (result.error === "BANNED") {
        navigate(ROUTES.BANNED);
        return;
      }
      setServerError(result.error || "Invalid email or password. Please try again.");
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
        label="Email Address"
        type="email"
        placeholder="john@example.com"
        error={errors.email?.message}
        required
        autoComplete="email"
        disabled={disabled}
        {...register("email")}
      />

      <div>
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          required
          autoComplete="current-password"
          disabled={disabled}
          {...register("password")}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              className="w-4 h-4 text-primary-600 dark:text-primary-500 border-neutral-300 dark:border-neutral-700 rounded focus:ring-primary-500 focus:ring-2 bg-white dark:bg-neutral-900"
              disabled={disabled}
              {...register("rememberMe")}
            />
            <label
              htmlFor="rememberMe"
              className="ml-2 text-sm text-neutral-700 dark:text-neutral-300"
            >
              Remember me
            </label>
          </div>
          <Link
            to="#forgot-password"
            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
          >
            Forgot password?
          </Link>
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
        {isSubmitting ? "Signing in..." : "Sign In"}
      </Button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link
          to={ROUTES.REGISTER}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
        >
          Sign up
        </Link>
      </p>
    </form>
  );
}
