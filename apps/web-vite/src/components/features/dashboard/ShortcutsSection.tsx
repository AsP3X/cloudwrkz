import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

export interface ShortcutItem {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
}

interface ShortcutsSectionProps {
  title?: string;
  primaryAction?: ShortcutItem;
  shortcuts: ShortcutItem[];
  className?: string;
}

export function ShortcutsSection({
  title = "Shortcuts",
  primaryAction,
  shortcuts,
  className,
}: ShortcutsSectionProps) {
  const list = primaryAction ? [primaryAction, ...shortcuts] : shortcuts;

  return (
    <section className={cn("", className)}>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((item) => {
          const isPrimary = item.primary ?? (primaryAction && item.href === primaryAction.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                "border-white/25 bg-white/75 backdrop-blur-md hover:border-primary-300/80 hover:shadow-md dark:border-white/10 dark:bg-neutral-950/50 dark:hover:border-primary-600/40",
                isPrimary &&
                  "border-primary-200/80 bg-primary-50/60 sm:col-span-2 lg:col-span-1 dark:border-primary-800/60 dark:bg-primary-950/35"
              )}
            >
              <span
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  isPrimary
                    ? "bg-primary-100 dark:bg-primary-900/60 text-primary-600 dark:text-primary-400 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/60"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                )}
              >
                {item.icon}
              </span>
              <div className="min-w-0">
                <span
                  className={cn(
                    "font-medium block",
                    isPrimary
                      ? "text-primary-700 dark:text-primary-300"
                      : "text-neutral-900 dark:text-neutral-100 group-hover:text-primary-700 dark:group-hover:text-primary-300"
                  )}
                >
                  {item.label}
                </span>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
