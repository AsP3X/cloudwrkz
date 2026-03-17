import { useState } from "react";
import { Input } from "@/components/ui/Input";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Search</h1>
        <Input
          label="Search"
          type="search"
          placeholder="Search across the platform..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500 dark:text-neutral-400">
          Search results will be implemented with the Rust API migration.
        </p>
      </div>
    </div>
  );
}
