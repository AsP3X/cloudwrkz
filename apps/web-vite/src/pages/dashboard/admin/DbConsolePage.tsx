import { useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export default function DbConsolePage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("SELECT id, email, name, role::text, status::text FROM users LIMIT 20");
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const data = await api.post<{ rows: Record<string, unknown>[] }>("/admin/db-query", { query: query.trim() });
      setResults(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== "ADMIN") {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
        <p className="text-neutral-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];
  const CARD_CLASS = "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800";

  const DbEmptyIcon = () => (
    <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Database Console</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">Run SELECT queries against the database</p>
        </div>
      </div>

      <div className={CARD_CLASS + " p-6"}>
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
          className="font-mono text-sm"
          placeholder="SELECT * FROM ..."
        />
        <div className="flex items-center gap-3 mt-3">
          <Button onClick={handleExecute} loading={loading}>Execute</Button>
          <span className="text-xs text-neutral-500">Only SELECT queries are allowed</span>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-sm text-error-700 dark:text-error-300">{error}</div>
        )}
      </div>

      {results && (
        <div className={CARD_CLASS + " overflow-hidden"}>
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{results.length} rows returned</span>
          </div>
          {results.length === 0 ? (
            <div className="p-12 text-center">
              <DbEmptyIcon />
              <p className="text-neutral-500 dark:text-neutral-400">No results</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800">
                    {columns.map((col) => (
                      <th key={col} className="text-left p-2 px-3 font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      {columns.map((col) => (
                        <td key={col} className="p-2 px-3 text-neutral-700 dark:text-neutral-300 whitespace-nowrap max-w-[300px] truncate font-mono text-xs">
                          {row[col] === null ? <span className="text-neutral-400 italic">null</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
