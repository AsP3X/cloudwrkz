// Human: Nested collapsible inside `CollapsibleNavSection`; expansion resets when `defaultExpanded` changes so route-driven defaults stay in sync.
// Agent: STATE isExpanded; EFFECT syncs from defaultExpanded; RENDERS smaller typography than parent section.
import React, { useEffect } from "react";
import { cn } from "@/lib/utils/cn";

interface SubCollapsibleNavGroupProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

/** Smaller nested collapsible for sub-groups (e.g. time off) inside a `CollapsibleNavSection`. */
export const SubCollapsibleNavGroup = ({
  title,
  children,
  defaultExpanded = false,
  className,
}: SubCollapsibleNavGroupProps) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  // Human: When the parent passes a new default (for example after navigation), we mirror it so nested groups reopen or collapse as intended.
  // Agent: WRITES isExpanded from defaultExpanded prop on dependency change.
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <div className={cn("space-y-0.5", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-400 transition-colors hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
        aria-expanded={isExpanded}
      >
        <span className="min-w-0 truncate">{title}</span>
        <svg
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-500 transition-transform duration-200",
            isExpanded ? "rotate-180" : ""
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-1 space-y-0.5 border-l border-neutral-200 pl-2.5 dark:border-neutral-700">{children}</div>
        </div>
      </div>
    </div>
  );
};
