"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { CurrentUser } from "@/lib/utils/auth-server";

type QueryResult =
  | { type: "rows"; columns: string[]; rows: Array<Record<string, unknown>> }
  | { type: "message"; message: string };

interface AdminDatabaseConsolePageProps {
  user: CurrentUser;
}

export function AdminDatabaseConsolePage({ user }: AdminDatabaseConsolePageProps) {
  const [query, setQuery] = React.useState<string>("SELECT NOW();");
  const [result, setResult] = React.useState<QueryResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);

  const handleRunQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/admin/db-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to execute query");
        setResult(null);
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to execute query");
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  const renderTable = () => {
    if (!result || result.type !== "rows") return null;
    if (result.rows.length === 0) {
      return (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Query executed successfully, but returned no rows.
        </p>
      );
    }

    return (
      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              {result.columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2 text-left text-xs font-semibold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-neutral-950 divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
            {result.rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                {result.columns.map((col) => (
                  <td
                    key={col}
                    className="px-4 py-2 whitespace-pre text-neutral-800 dark:text-neutral-100 font-mono text-xs"
                  >
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMessage = () => {
    if (!result || result.type !== "message") return null;
    return (
      <div className="mt-4 rounded-lg bg-success-50 dark:bg-success-900/10 border border-success-200 dark:border-success-800 px-4 py-3">
        <p className="text-sm text-success-800 dark:text-success-300">{result.message}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/60 dark:border-neutral-800/60 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
            Database Console
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
            Run read-only SQL queries against the application database. Use with care.
          </p>
        </div>
      </div>

      {/* Query form */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 space-y-4">
        <form onSubmit={handleRunQuery} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              SQL Query
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Only SELECT statements are allowed. Other statements will be rejected.
            </p>
            <Textarea
              rows={6}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="font-mono text-sm"
              placeholder="SELECT * FROM users LIMIT 10;"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-error-50 dark:bg-error-900/10 border border-error-200 dark:border-error-800 px-4 py-3">
              <p className="text-sm text-error-800 dark:text-error-300 break-words">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Signed in as <span className="font-semibold">{user.email}</span>
            </p>
            <Button type="submit" disabled={isRunning} loading={isRunning}>
              Run query
            </Button>
          </div>
        </form>

        {/* Results */}
        {renderTable()}
        {renderMessage()}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  return String(value);
}

