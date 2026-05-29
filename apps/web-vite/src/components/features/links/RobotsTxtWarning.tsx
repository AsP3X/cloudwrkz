import { cn } from "@/lib/utils/cn";

// Human: Warns when robots.txt blocked our scraper so users know why preview fields may be missing.
// Agent: PRESENTATIONAL; READS message prop; VARIANT warning styles.

interface RobotsTxtWarningProps {
  message: string;
  className?: string;
}

export function RobotsTxtWarning({ message, className }: RobotsTxtWarningProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex gap-3">
        <svg
          className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <p className="font-medium">robots.txt restriction</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200/90 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}
