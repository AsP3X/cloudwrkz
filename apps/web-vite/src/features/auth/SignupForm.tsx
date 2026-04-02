import React, { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { RegistrationQueuedPanel } from "@/features/auth/RegistrationQueuedPanel";
import { PasswordStrengthBar } from "@/features/auth/PasswordStrengthBar";
import { getPwnedPasswordCount } from "@/lib/auth/pwnedPasswords";
import { isCommonPassword } from "@/lib/auth/passwordStrength";

type SignupFormProps = {
  disabled?: boolean;
};

export function SignupForm({ disabled = false }: SignupFormProps) {
  const { register: registerUser } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [queuedJobTrigger, setQueuedJobTrigger] = React.useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = React.useState(false);

  const handlePanelTerminal = useCallback((outcome: "completed" | "failed" | "expired") => {
    if (outcome === "completed") {
      setRegistrationSuccess(true);
    } else if (outcome === "expired") {
      setServerError(
        "That registration session is no longer available. Please submit the form again to create your account.",
      );
    } else if (outcome === "failed") {
      setServerError("Registration could not be completed. Please try again or use a different email.");
    }
    setQueuedJobTrigger(null);
  }, []);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      agreeToTerms: false,
      password: "",
    },
  });

  const passwordValue = useWatch({ control, name: "password", defaultValue: "" }) ?? "";

  const [hibpCount, setHibpCount] = useState<number | null>(null);
  const [hibpLoading, setHibpLoading] = useState(false);
  const [hibpCheckedPwd, setHibpCheckedPwd] = useState("");

  const checkPwned = useCallback(async (pwd: string) => {
    if (!pwd || pwd.length < 8) {
      setHibpCount(null);
      setHibpCheckedPwd("");
      return;
    }
    if (pwd === hibpCheckedPwd && hibpCount !== null) return;

    setHibpLoading(true);
    setHibpCount(null);
    try {
      const count = await getPwnedPasswordCount(pwd);
      setHibpCount(count);
      setHibpCheckedPwd(pwd);
    } finally {
      setHibpLoading(false);
    }
  }, [hibpCheckedPwd, hibpCount]);

  const passwordField = register("password");

  const handlePasswordBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      passwordField.onBlur(e);
      checkPwned(e.target.value);
    },
    [passwordField, checkPwned],
  );

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);

    const breachCount = await getPwnedPasswordCount(data.password);
    if (breachCount !== null && breachCount > 0) {
      setError("password", {
        type: "manual",
        message: `This password has appeared in known data breaches (${breachCount.toLocaleString()} times). Please choose a different password.`,
      });
      return;
    }

    const result = await registerUser(data);

    if (result.success && "queued" in result && result.queued && result.jobId) {
      setQueuedJobTrigger(result.jobId);
      return;
    }

    if (!result.success && result.error) {
      setServerError(result.error);
    } else if (result.success) {
      setServerError("Unexpected response from server.");
    }
  };

  const passwordIsBreached = hibpCount != null && hibpCount > 0;
  const passwordIsCommon = isCommonPassword(passwordValue);
  const passwordBlocked = passwordIsBreached || passwordIsCommon;

  const fieldsLocked = Boolean(queuedJobTrigger) || registrationSuccess;

  if (registrationSuccess) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border-2 border-success-300 dark:border-success-700 bg-success-50 dark:bg-success-950 p-6 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-200/80 dark:bg-success-900/50">
              <svg
                className="h-6 w-6 text-success-700 dark:text-success-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-success-900 dark:text-success-100">
            Account created
          </h3>
          <p className="mt-1 text-sm text-success-800 dark:text-success-200">
            Your registration is complete. You can now sign in with your credentials.
          </p>
          <Link
            to={ROUTES.LOGIN}
            className="mt-4 inline-block rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

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
        label="Full Name"
        type="text"
        placeholder="John Doe"
        error={errors.name?.message}
        required
        disabled={disabled || fieldsLocked}
        {...register("name")}
      />

      <Input
        label="Email Address"
        type="email"
        placeholder="john@example.com"
        error={errors.email?.message}
        helperText="We'll never share your email with anyone else."
        required
        disabled={disabled || fieldsLocked}
        {...register("email")}
      />

      <div>
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          required
          disabled={disabled || fieldsLocked}
          autoComplete="new-password"
          ref={passwordField.ref}
          name={passwordField.name}
          onChange={passwordField.onChange}
          onBlur={handlePasswordBlur}
        />
        <PasswordStrengthBar
          password={passwordValue}
          pwnedCount={hibpCount}
          pwnedLoading={hibpLoading}
          className="mt-2"
        />
      </div>

      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            id="agreeToTerms"
            type="checkbox"
            className="w-4 h-4 text-primary-600 dark:text-primary-500 border-neutral-300 dark:border-neutral-700 rounded focus:ring-primary-500 focus:ring-2 bg-white dark:bg-neutral-900"
            disabled={disabled || fieldsLocked}
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

      {queuedJobTrigger ? (
        <RegistrationQueuedPanel
          triggerJobId={queuedJobTrigger}
          onTerminalStatus={handlePanelTerminal}
          className="mb-0 w-full min-h-[3rem]"
        />
      ) : (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={isSubmitting}
          disabled={isSubmitting || disabled || passwordBlocked}
        >
          Create Account
        </Button>
      )}

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
