export function LinksListLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 gap-4 bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 min-h-[320px]"
      role="status"
      aria-live="polite"
      aria-label="Loading links"
    >
      <div
        className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"
        aria-hidden
      />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading links…</p>
    </div>
  );
}
