import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `DashboardPinnedFavorites` in the signed-in home dashboard: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE dashboard; WIDGETS shortcuts activity todos; EXPORTS DashboardPinnedFavorites; REACT component; READS props hooks; MAY CALL api client.
export interface DashboardFavoriteItem {
  id: string;
  title: string;
  url?: string | null;
  href: string;
}

interface DashboardPinnedFavoritesProps {
  items: DashboardFavoriteItem[];
  viewAllHref: string;
  emptyMessage?: string;
  className?: string;
}

export function DashboardPinnedFavorites({
  items,
  viewAllHref,
  emptyMessage = "No favorites yet. Star links from My Links.",
  className,
}: DashboardPinnedFavoritesProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-white/25 bg-white/82 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/15 p-4 sm:p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Favorites
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
                  <span className="shrink-0 mt-0.5 text-amber-500" aria-hidden>
                    ★
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-primary-700 dark:group-hover:text-primary-300 block truncate">
                      {item.title}
                    </span>
                    {item.url && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate block">
                        {item.url}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
