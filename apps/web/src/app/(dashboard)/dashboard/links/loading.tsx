import { LinksListLoader } from "./LinksListLoader";

export default function LinksLoading() {
  return (
    <div className="space-y-6">
      {/* Placeholder header so layout doesn't shift */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="h-9 w-64 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
          <div className="h-5 w-96 mt-2 bg-neutral-100 dark:bg-neutral-800 rounded animate-pulse" />
        </div>
      </div>
      {/* Full-area loader where list will appear */}
      <LinksListLoader />
    </div>
  );
}
