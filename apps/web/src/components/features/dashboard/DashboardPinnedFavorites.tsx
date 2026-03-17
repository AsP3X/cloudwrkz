import Link from "next/link";
import { cn } from "@/lib/utils/cn";

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
        "rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="p-4 sm:p-5 border-b border-neutral-200/60 dark:border-neutral-800/60 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Favorites
        </h2>
        <Link
          href={viewAllHref}
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
                  href={item.href}
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
