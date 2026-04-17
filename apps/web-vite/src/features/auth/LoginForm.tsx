import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";
import { QrLoginPanel } from "@/features/auth/QrLoginPanel";

type LoginFormProps = {
  initialError?: string;
  disabled?: boolean;
};

export function LoginForm({ initialError, disabled = false }: LoginFormProps) {
  const navigate = useNavigate();
  const { login, loginQueuedUi } = useAuth();

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
    getInitialErrorMessage(initialError),
  );
  const [queuedSuccessInfo, setQueuedSuccessInfo] = React.useState<string | null>(null);
  const [showQrPanel, setShowQrPanel] = React.useState(false);

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
    setQueuedSuccessInfo(null);

    const result = await login(data.email, data.password, data.rememberMe);

    if (result.success) {
      setQueuedSuccessInfo(
        "Your sign-in job finished and your session is active—we’re opening the dashboard.",
      );
      window.setTimeout(() => navigate(ROUTES.DASHBOARD), 2200);
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
      {queuedSuccessInfo && (
        <div
          className="rounded-lg border border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-950/60 px-3 py-2 shadow-sm"
          role="status"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-200/80 dark:bg-success-900/50">
              <svg
                className="w-4 h-4 text-success-700 dark:text-success-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-success-900 dark:text-success-100">
                Sign-in complete
              </p>
              <p className="mt-0.5 text-xs font-medium text-success-800 dark:text-success-200 leading-snug">
                {queuedSuccessInfo}
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
        label="Email Address"
        type="email"
        placeholder="john@example.com"
        error={errors.email?.message}
        required
        autoComplete="email"
        disabled={disabled || Boolean(loginQueuedUi)}
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
          disabled={disabled || Boolean(loginQueuedUi)}
          {...register("password")}
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              className="w-4 h-4 text-primary-600 dark:text-primary-500 border-neutral-300 dark:border-neutral-700 rounded focus:ring-primary-500 focus:ring-2 bg-white dark:bg-neutral-900"
              disabled={disabled || Boolean(loginQueuedUi)}
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

      {loginQueuedUi ? (
        <LoginQueuedBanner state={loginQueuedUi} className="mb-0 w-full min-h-[3rem]" />
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="flex-1"
            loading={isSubmitting}
            disabled={isSubmitting || disabled}
          >
            Sign In
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-11 p-0"
            onClick={() => setShowQrPanel((v) => !v)}
            disabled={isSubmitting || disabled}
            aria-label="Sign in with QR code"
            title="Sign in with QR code"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
            </svg>
          </Button>
        </div>
      )}

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        Don&apos;t have an account?{" "}
        <Link
          to={ROUTES.REGISTER}
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
        >
          Sign up
        </Link>
      </p>

      {showQrPanel ? (
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <QrLoginPanel onClose={() => setShowQrPanel(false)} />
        </div>
      ) : null}
    </form>
  );
}
