// Human: Lightweight GET hook, async form submit helper, and shared date/duration helpers reused across dashboard views.
// Agent: useApi USES api.get; useFormSubmit USES mounted ref; formatters PURE locale string builders; NO routing.

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/client";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Human: Loads JSON from a GET path whenever the path or dependency list changes, surfacing errors as plain strings.
// Agent: STATE {data,loading,error}; useEffect DEPENDS reload; CALLS api.get<T>(path); RETURNS reload callback.

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: !!path,
    error: null,
  });

  const reload = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get<T>(path);
      setState({ data, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setState({ data: null, loading: false, error: msg });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

// Human: Wraps arbitrary async submit handlers so buttons can show a shared submitting flag without duplicating try/catch.
// Agent: REF mounted lifecycle; MUTATES submitting error; submit AWAITS fn; SKIPS state if unmounted; RETURNS result|null.

export function useFormSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const submit = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await fn();
      if (mounted.current) setSubmitting(false);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      if (mounted.current) {
        setError(msg);
        setSubmitting(false);
      }
      return null;
    }
  }, []);

  return { submitting, error, setError, submit };
}

// Human: Formats API timestamps for tables using the visitor locale, using an em dash when data is missing or invalid.
// Agent: READS ISO dateStr; RETURNS toLocaleDateString or "—"; PURE; NO timezone conversion beyond Date parsing.

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Human: Same as formatDate but includes time-of-day for activity feeds and audit-style rows.
// Agent: READS dateStr; RETURNS toLocaleString datetime; INVALID RETURNS "—".

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Human: Presents elapsed seconds as the largest sensible unit so timer widgets stay compact.
// Agent: READS totalSeconds number; RETURNS h/m/s string; INTEGER floor division only.

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// Human: Shows friendly relative labels for recent events and falls back to absolute dates for older items.
// Agent: READS dateStr; COMPUTES diff vs now; RETURNS "just now"|"Nm ago"|CALLS formatDate when >30d threshold.

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}
