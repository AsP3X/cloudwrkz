import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `RecentActivityPanel` in the signed-in home dashboard: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE dashboard; WIDGETS shortcuts activity todos; EXPORTS RecentActivityPanel; REACT component; READS props hooks; MAY CALL api client.
export interface RecentItem {
  id: string;
  title: string;
  href: string;
  meta?: React.ReactNode;
  badge?: string;
}

export interface RecentSection {
  title: string;
  viewAllHref?: string;
  items: RecentItem[];
  emptyMessage?: string;
}

interface RecentActivityPanelProps {
  sections: RecentSection[];
  title?: string;
  className?: string;
}

export function RecentActivityPanel({
  sections,
  title = "Recent activity",
  className,
}: RecentActivityPanelProps) {
  return (
    <aside
      className={cn(
        "overflow-hidden rounded-2xl border border-white/25 bg-white/82 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55",
        className
      )}
    >
      <div className="border-b border-white/15 p-4 sm:p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h2>
      </div>
      <div className="divide-y divide-white/15 dark:divide-white/10">
        {sections.map((section) => (
          <div key={section.title} className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {section.title}
              </h3>
              {section.viewAllHref && (
                <Link
                  to={section.viewAllHref}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  View all →
                </Link>
              )}
            </div>
            {section.items.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
                {section.emptyMessage ?? "Nothing recent."}
              </p>
            ) : (
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.href}
                      className={cn(
                        "block rounded-lg p-3 border border-transparent hover:border-primary-200 dark:hover:border-primary-800 hover:bg-primary-50/30 dark:hover:bg-primary-950/20 transition-colors"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className="shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.meta && (
                        <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {item.meta}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
