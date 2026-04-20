import React from "react";
import { cn } from "@/lib/utils/cn";

interface CollapsibleNavSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export const CollapsibleNavSection = ({
  title,
  icon,
  children,
  defaultExpanded = true,
  className,
}: CollapsibleNavSectionProps) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{icon}</span>
          <span className="min-w-0 truncate">{title}</span>
        </div>
        <svg
          className={cn(
            "h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400 transition-transform duration-200",
            isExpanded ? "transform rotate-180" : ""
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="pl-4 space-y-1 border-l-2 border-neutral-200 dark:border-neutral-800 ml-6 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
