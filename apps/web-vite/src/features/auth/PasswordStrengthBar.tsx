import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { analyzePasswordStrength } from "@/lib/auth/passwordStrength";

export type PasswordStrengthBarProps = {
  password: string;
  /** Result of HIBP check: null = not loaded yet or request failed (we do not assume safe). */
  pwnedCount: number | null;
  pwnedLoading?: boolean;
  className?: string;
};

/**
 * Visual strength + breach UI. Breach lookup is performed by the parent so we subscribe via
 * `useWatch` there (reliable with react-hook-form + zod); this component stays presentational.
 */
export function PasswordStrengthBar({
  password,
  pwnedCount,
  pwnedLoading = false,
  className,
}: PasswordStrengthBarProps) {
  const analysis = useMemo(
    () => analyzePasswordStrength(password, { pwnedCount }),
    [password, pwnedCount],
  );

  const isBreached = pwnedCount != null && pwnedCount > 0;
  const barWidthPercent = isBreached ? 100 : analysis.score;

  if (!password) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
          aria-hidden
        />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Use 8+ characters with upper and lowercase letters, a number, and a symbol. We also check
          the free{" "}
          <a
            href="https://haveibeenpwned.com/Passwords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 underline decoration-primary-600/40 hover:decoration-primary-600 dark:text-primary-400 dark:decoration-primary-400/40"
          >
            Have I Been Pwned
          </a>{" "}
          breach list (no password is sent in full).
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg",
        isBreached &&
          "border border-error-300 bg-error-50 p-3 dark:border-error-700 dark:bg-error-950/80",
        className,
      )}
      role={isBreached ? "alert" : undefined}
      aria-live={isBreached ? "assertive" : undefined}
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
          isBreached ? "h-2" : "h-1.5",
        )}
        role="progressbar"
        aria-valuenow={isBreached ? 100 : analysis.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={isBreached ? "Password found in data breaches" : `Password strength: ${analysis.label}`}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", analysis.barColorClass)}
          style={{ width: `${barWidthPercent}%` }}
        />
      </div>
      <p
        className={cn(
          "text-sm leading-snug",
          isBreached
            ? "font-semibold text-error-800 dark:text-error-100"
            : "text-xs font-medium text-neutral-600 dark:text-neutral-300",
        )}
      >
        {isBreached ? (
          <>
            <span className="mr-1.5 inline-block align-middle text-error-600 dark:text-error-400" aria-hidden>
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            {analysis.label}
          </>
        ) : (
          analysis.label
        )}
      </p>
      {pwnedLoading && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
          Checking Have I Been Pwned…
        </p>
      )}
    </div>
  );
}
