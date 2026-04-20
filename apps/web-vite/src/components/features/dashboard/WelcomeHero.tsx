import { getTimeOfDayGreeting, formatDashboardDate } from "@/lib/utils/greeting";
import { cn } from "@/lib/utils/cn";

interface WelcomeHeroProps {
  name: string;
  title?: string;
  role: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
  showDynamicGreeting?: boolean;
  className?: string;
}

const ROLE_LABELS: Record<WelcomeHeroProps["role"], string> = {
  USER: "User",
  AGENT: "Agent",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
};

export function WelcomeHero({
  name,
  title,
  role,
  showDynamicGreeting = true,
  className,
}: WelcomeHeroProps) {
  const greeting = showDynamicGreeting ? getTimeOfDayGreeting() : "Welcome back";
  const dateStr = showDynamicGreeting ? formatDashboardDate() : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/25 bg-white/82 p-6 shadow-sm backdrop-blur-md sm:p-8 dark:border-white/10 dark:bg-neutral-950/55",
        className
      )}
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary-100/40 to-secondary-100/40 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-24 -mt-24" />
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">
            {dateStr}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-1">
            {greeting}, <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">{name}</span>
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            {title ?? "Here's your overview for today."}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0",
            "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border border-primary-200/60 dark:border-primary-800/60"
          )}
        >
          {ROLE_LABELS[role]}
        </span>
      </div>
    </div>
  );
}
