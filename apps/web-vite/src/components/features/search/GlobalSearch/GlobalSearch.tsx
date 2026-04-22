import { useState, useEffect } from "react";
import { SearchDialog } from "../SearchDialog";
import { cn } from "@/lib/utils/cn";

// Human: React UI for `GlobalSearch` in global search UX and result handling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE search; QUERY results preview; EXPORTS GlobalSearch; REACT component; READS props hooks; MAY CALL api client.
type GlobalSearchProps = {
  /** ~75%-scale control when the dashboard header is compact while scrolled. */
  compact?: boolean;
};

export const GlobalSearch = ({ compact = false }: GlobalSearchProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) && 
        e.key === 'f' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsDialogOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <SearchDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      
      <button
        onClick={() => setIsDialogOpen(true)}
        className={cn(
          "flex min-w-0 items-center justify-start gap-2 rounded-lg border-2 transition-all duration-300 ease-out",
          compact
            ? "w-full px-2.5 py-1 sm:w-60 sm:px-3.5 lg:w-[17.5rem]"
            : "w-full px-3 py-2 sm:w-64 sm:px-4 lg:w-80",
          "bg-white text-neutral-600 border-neutral-200",
          "dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800",
          "hover:border-neutral-300 dark:hover:border-neutral-700",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
          "focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400",
        )}
        aria-label="Search"
      >
        <svg
          className={cn(
            "shrink-0 text-neutral-400 transition-[width,height] duration-300 ease-out",
            compact ? "h-[1.125rem] w-[1.125rem]" : "h-5 w-5",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span
          className={cn(
            "truncate text-neutral-500 transition-[font-size] duration-300 ease-out dark:text-neutral-400",
            compact ? "text-[0.8125rem] leading-tight" : "text-sm",
          )}
        >
          Search...
        </span>
        {!compact && (
          <div className="ml-auto hidden shrink-0 items-center gap-1 text-xs text-neutral-400 dark:text-neutral-600 sm:flex">
            <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-800">
              Ctrl
            </kbd>
            <span className="text-neutral-400">+</span>
            <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-800">
              F
            </kbd>
          </div>
        )}
      </button>
    </>
  );
};
