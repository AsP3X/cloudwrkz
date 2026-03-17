export default function AuditLogLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-8 w-48 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="h-4 w-72 mt-2 bg-neutral-100 dark:bg-neutral-800 rounded" />
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((_, i) => (
            <div key={`skeleton-filter-${i}`} className="h-12 bg-neutral-100 dark:bg-neutral-800 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="h-12 bg-neutral-50 dark:bg-neutral-800/50" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((_, i) => (
          <div
            key={`skeleton-row-${i}`}
            className="h-14 border-t border-neutral-200 dark:border-neutral-800 flex gap-4 px-4 items-center"
          >
            <div className="h-4 w-32 bg-neutral-100 dark:bg-neutral-800 rounded" />
            <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-800 rounded" />
            <div className="h-4 w-28 bg-neutral-100 dark:bg-neutral-800 rounded" />
            <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800 rounded" />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <div className="h-5 w-48 bg-neutral-100 dark:bg-neutral-800 rounded" />
        <div className="h-9 w-32 bg-neutral-100 dark:bg-neutral-800 rounded" />
      </div>
    </div>
  );
}
