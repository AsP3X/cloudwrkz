"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export interface QuickNavItem {
  label: string;
  href: string;
}

interface QuickNavChipsProps {
  items: QuickNavItem[];
  className?: string;
}

/** Client wrapper so we can use usePathname for active state. */
function QuickNavChipsClient({ items, className }: QuickNavChipsProps) {
  const pathname = usePathname();

  if (!items || items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm px-4 py-3 flex items-center gap-3 overflow-x-auto",
        "scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-700 scrollbar-track-transparent",
        className,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 shrink-0">
        Jump to
      </span>
      <nav
        className="flex items-center gap-2 min-w-0"
        aria-label="Quick navigation"
      >
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border",
                isActive
                  ? "bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800"
                  : "bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Server-safe export: pass items from server, render client nav. */
export { QuickNavChipsClient as QuickNavChips };
