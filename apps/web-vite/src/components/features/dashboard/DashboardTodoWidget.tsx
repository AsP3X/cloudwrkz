import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

export interface DashboardTodoItem {
  id: string;
  title: string;
  status: string;
  href: string;
  todoNumber?: string;
  dueDate?: string | Date | null;
}

interface DashboardTodoWidgetProps {
  items: DashboardTodoItem[];
  viewAllHref: string;
  emptyMessage?: string;
  className?: string;
}

const statusClass: Record<string, string> = {
  NOT_STARTED: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  BLOCKED: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  COMPLETED: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  CANCELLED: "bg-neutral-100 dark:bg-neutral-700 text-neutral-500",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ");
}

function formatRelativeDueDate(dueDate: string | Date): {
  label: string;
  variant: "overdue" | "today" | "soon" | "future";
} {
  const now = new Date();
  const due = new Date(dueDate);
  // Compare calendar dates (strip time)
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffMs = dueDay.getTime() - nowDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return { label: `Overdue ${abs} day${abs !== 1 ? "s" : ""}`, variant: "overdue" };
  }
  if (diffDays === 0) return { label: "Due today", variant: "today" };
  if (diffDays === 1) return { label: "Due tomorrow", variant: "soon" };
  if (diffDays <= 7) return { label: `Due in ${diffDays} days`, variant: "soon" };
  return { label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, variant: "future" };
}

const dueDateVariantClass: Record<string, string> = {
  overdue: "text-red-600 dark:text-red-400",
  today: "text-amber-600 dark:text-amber-400",
  soon: "text-yellow-600 dark:text-yellow-400",
  future: "text-neutral-500 dark:text-neutral-400",
};

export function DashboardTodoWidget({
  items,
  viewAllHref,
  emptyMessage = "No tasks right now.",
  className,
}: DashboardTodoWidgetProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-white/25 bg-white/82 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/15 p-4 sm:p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          My tasks
        </h2>
        <Link
          to={viewAllHref}
          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="p-4 sm:p-5">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {emptyMessage}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="flex items-start gap-3 rounded-lg p-3 border border-transparent hover:border-primary-200 dark:hover:border-primary-800 hover:bg-primary-50/30 dark:hover:bg-primary-950/20 transition-colors group"
                >
                  <span
                    className={cn(
                      "shrink-0 w-2 h-2 rounded-full mt-1.5",
                      item.status === "COMPLETED"
                        ? "bg-green-500"
                        : "bg-primary-500 dark:bg-primary-400"
                    )}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <span className="block font-medium text-neutral-900 dark:text-neutral-100 truncate group-hover:text-primary-700 dark:group-hover:text-primary-300">
                      {item.title}
                    </span>
                    {item.dueDate && item.status !== "COMPLETED" && item.status !== "CANCELLED" && (() => {
                      const { label, variant } = formatRelativeDueDate(item.dueDate);
                      return (
                        <span className={cn("block text-xs mt-0.5", dueDateVariantClass[variant])}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded text-xs font-medium mt-0.5",
                      statusClass[item.status] ?? statusClass.NOT_STARTED
                    )}
                  >
                    {formatStatus(item.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
