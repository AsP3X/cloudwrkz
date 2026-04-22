import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `ProfileCompleteness` in account, privacy, and session settings: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE settings; SECURITY sessions delete-account; EXPORTS ProfileCompleteness; REACT component; READS props hooks; MAY CALL api client.
interface ProfileCompletenessProps {
  hasAvatar: boolean;
  hasBio: boolean;
  emailVerified: boolean;
  hasCustomTimezone: boolean;
  hasName: boolean;
  className?: string;
}

interface CompletenessItem {
  label: string;
  done: boolean;
  href: string;
  hint: string;
}

export function ProfileCompleteness({
  hasAvatar,
  hasBio,
  emailVerified,
  hasCustomTimezone,
  hasName,
  className,
}: ProfileCompletenessProps) {
  const items: CompletenessItem[] = [
    {
      label: "Add your name",
      done: hasName,
      href: "/dashboard/profile",
      hint: "Let others know who you are",
    },
    {
      label: "Upload an avatar",
      done: hasAvatar,
      href: "/dashboard/profile",
      hint: "Add a photo to personalize your account",
    },
    {
      label: "Verify your email",
      done: emailVerified,
      href: "/dashboard/profile",
      hint: "Confirm your email address",
    },
    {
      label: "Write a short bio",
      done: hasBio,
      href: "/dashboard/profile",
      hint: "Tell others a little about yourself",
    },
    {
      label: "Set your timezone",
      done: hasCustomTimezone,
      href: "/dashboard/settings",
      hint: "Ensure times display correctly for your location",
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = Math.round((completedCount / total) * 100);

  if (completedCount === total) return null;

  return (
    <section
      className={cn(
        "rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="p-4 sm:p-5 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Complete your profile
          </h2>
          <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {completedCount}/{total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-500 dark:bg-primary-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Profile ${percent}% complete`}
          />
        </div>
      </div>

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 opacity-50">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-success-100 dark:bg-success-900/40 flex items-center justify-center">
                  <svg className="w-3 h-3 text-success-600 dark:text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-neutral-500 dark:text-neutral-500 line-through">
                  {item.label}
                </span>
              </div>
            ) : (
              <Link
                to={item.href}
                className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors group"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 group-hover:border-primary-400 dark:group-hover:border-primary-500 transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {item.label}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {item.hint}
                  </p>
                </div>
                <svg className="w-4 h-4 text-neutral-400 dark:text-neutral-600 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
