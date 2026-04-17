import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { cn } from "@/lib/utils/cn";

const POLL_MS = 12_000;

const JOB_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;
type JobPageSize = (typeof JOB_PAGE_SIZE_OPTIONS)[number] | "all";

/** Bounded-length page list: ellipsis instead of thousands of controls. */
function buildPaginationWindow(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages < 1) return [];
  if (totalPages === 1) return [1];
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const r: Array<number | "ellipsis"> = [];
  const left = Math.max(2, currentPage - 2);
  const right = Math.min(totalPages - 1, currentPage + 2);
  r.push(1);
  if (left > 2) r.push("ellipsis");
  for (let i = left; i <= right; i++) r.push(i);
  if (right < totalPages - 1) r.push("ellipsis");
  r.push(totalPages);
  return r;
}

function JobTableFooter({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  selectId,
  summaryLabel,
}: {
  total: number;
  page: number;
  pageSize: JobPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: JobPageSize) => void;
  selectId: string;
  summaryLabel: string;
}) {
  const pageSizeNum = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const totalPages = pageSize === "all" || total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const showPager = pageSize !== "all" && total > pageSize;
  const windowModel = showPager ? buildPaginationWindow(page, totalPages) : [];

  const showingStart = total === 0 ? 0 : (page - 1) * pageSizeNum + 1;
  const showingEnd = pageSize === "all" ? total : Math.min(page * pageSize, total);

  return (
    <div
      className="border-t border-neutral-100 bg-neutral-50/50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-800/25 sm:px-4"
      aria-label={summaryLabel}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
            {total === 0
              ? "No rows"
              : pageSize === "all"
                ? `Showing all ${total}`
                : `Showing ${showingStart}–${showingEnd} of ${total}`}
          </p>
          {showPager ? (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-8 px-0"
                disabled={page <= 1}
                onClick={() => onPageChange(1)}
                aria-label="First page"
              >
                «
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-8 px-0"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Previous page"
              >
                ‹
              </Button>
              {windowModel.map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-sm text-neutral-400 select-none" aria-hidden>
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    type="button"
                    variant={item === page ? "primary" : "outline"}
                    size="sm"
                    className="h-8 min-w-8 px-0"
                    onClick={() => onPageChange(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? "page" : undefined}
                  >
                    {item}
                  </Button>
                ),
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-8 px-0"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                aria-label="Next page"
              >
                ›
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 min-w-8 px-0"
                disabled={page >= totalPages}
                onClick={() => onPageChange(totalPages)}
                aria-label="Last page"
              >
                »
              </Button>
            </nav>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={selectId} className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Rows per page
          </label>
          <select
            id={selectId}
            value={pageSize === "all" ? "all" : String(pageSize)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") {
                onPageSizeChange("all");
              } else {
                const n = Number(v);
                if (JOB_PAGE_SIZE_OPTIONS.includes(n as (typeof JOB_PAGE_SIZE_OPTIONS)[number])) {
                  onPageSizeChange(n as JobPageSize);
                }
              }
            }}
            className="h-8 min-w-[5.5rem] rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:focus-visible:ring-offset-neutral-900"
          >
            {JOB_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="all">All</option>
          </select>
        </div>
      </div>
    </div>
  );
}

type CreatedBy = {
  id: string;
  email: string;
  name: string | null;
};

type BackgroundJobRow = {
  id: string;
  jobType: string;
  status: string;
  payload: Record<string, unknown>;
  errorMessage?: string | null;
  dedupeKey?: string | null;
  createdByUserId?: string | null;
  createdBy?: CreatedBy | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

type JobDetailResult = {
  kind: string;
  link?: {
    id: string;
    title?: string | null;
    url: string;
    metadata: unknown;
    metadataExtractedAt?: string | null;
  };
  note?: string;
};

type JobDetail = BackgroundJobRow & {
  success: boolean;
  result?: JobDetailResult | null;
};

type BackgroundJobsResponse = {
  jobs: BackgroundJobRow[];
};

type JobDetailResponse = {
  job: JobDetail;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending":
      return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60";
    case "processing":
      return "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border border-sky-200/80 dark:border-sky-800/60";
    case "completed":
      return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/80 dark:border-emerald-800/60";
    case "failed":
      return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200/80 dark:border-red-800/60";
    case "cancelled":
      return "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border border-neutral-300/80 dark:border-neutral-600";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700";
  }
}

function formatTriggerLabel(j: Pick<BackgroundJobRow, "createdBy" | "createdByUserId">): string {
  if (j.createdBy) {
    const { name, email, id } = j.createdBy;
    const primary = (name && name.trim()) || email || id;
    const secondary = email && email !== primary ? ` · ${email}` : "";
    return `${primary}${secondary}`;
  }
  if (j.createdByUserId) return `User ${j.createdByUserId}`;
  return "—";
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sortFinishedJobs(rows: BackgroundJobRow[]): BackgroundJobRow[] {
  const ts = (j: BackgroundJobRow) => j.completedAt ?? j.updatedAt ?? j.createdAt;
  return [...rows].sort((a, b) => ts(b).localeCompare(ts(a)));
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
}

function jobDuration(j: BackgroundJobRow): string {
  if (!j.startedAt || !j.completedAt) return "—";
  const a = new Date(j.startedAt).getTime();
  const b = new Date(j.completedAt).getTime();
  return formatDurationMs(b - a);
}

function Def({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-900 dark:text-neutral-100 break-words">{children}</dd>
    </div>
  );
}

function IconPulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

function IconQueue({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M5 6h14M5 12h10M5 18h6" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 8v4l2.5 1.5M21 12a9 9 0 11-9-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSliders({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M9 17h6M7 7h4M15 13h2" strokeLinecap="round" />
    </svg>
  );
}

type MetricAccent = "amber" | "sky" | "emerald" | "red";

const METRIC_DOT: Record<MetricAccent, string> = {
  amber: "bg-amber-500 dark:bg-amber-400",
  sky: "bg-sky-500 dark:bg-sky-400",
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  red: "bg-red-500 dark:bg-red-400",
};

function JobMetricsCompactRail({
  pending,
  processing,
  succeeded,
  failed,
}: {
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
}) {
  const segments: {
    label: string;
    value: number;
    hint: string;
    accent: MetricAccent;
  }[] = [
    { label: "Pending", value: pending, hint: "Waiting for a worker slot", accent: "amber" },
    { label: "Running", value: processing, hint: "Currently executing", accent: "sky" },
    { label: "Succeeded", value: succeeded, hint: "In the loaded history window", accent: "emerald" },
    { label: "Failed", value: failed, hint: "In the loaded history window", accent: "red" },
  ];

  return (
    <div
      className="overflow-hidden rounded-xl border border-neutral-200/60 bg-white shadow-sm dark:border-neutral-800/80 dark:bg-neutral-900"
      role="region"
      aria-label="Job counts summary"
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-[17.5rem] w-full items-stretch px-2 py-2.5 sm:min-w-0 sm:px-3 sm:py-3">
          {segments.map((s, i) => (
            <div
              key={s.label}
              title={s.hint}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center px-1 text-center sm:px-2",
                i > 0 && "border-l border-neutral-200/60 dark:border-neutral-800",
              )}
            >
              <span className={cn("mb-1 h-1.5 w-1.5 shrink-0 rounded-full", METRIC_DOT[s.accent])} aria-hidden />
              <span className="w-full truncate text-[10px] font-medium leading-none text-neutral-500 dark:text-neutral-400 sm:text-[11px]">
                {s.label}
              </span>
              <span className="mt-1 text-base font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-lg">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobTable({
  jobs,
  onRowClick,
  showDuration,
  flush,
}: {
  jobs: BackgroundJobRow[];
  onRowClick: (id: string) => void;
  showDuration?: boolean;
  /** When true, no inner frame — table uses the parent section border as its edge. */
  flush?: boolean;
}) {
  const table = (
    <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/90 dark:bg-neutral-800/50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Triggered by</th>
            <th className="px-4 py-3 font-medium">Payload</th>
            <th className="px-4 py-3 font-medium whitespace-nowrap">Created</th>
            <th className="px-4 py-3 font-medium whitespace-nowrap">Started</th>
            {showDuration ? <th className="px-4 py-3 font-medium whitespace-nowrap">Duration</th> : null}
            <th className="px-4 py-3 font-medium whitespace-nowrap">Completed</th>
            <th className="px-4 py-3 font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/90">
          {jobs.map((j) => (
            <tr
              key={j.id}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(j.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onRowClick(j.id);
                }
              }}
              className="align-top cursor-pointer transition-colors hover:bg-primary-50/50 dark:hover:bg-primary-950/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/60"
            >
              <td className="px-4 py-3">
                <Badge className={statusBadgeClass(j.status)}>{j.status}</Badge>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-neutral-800 dark:text-neutral-200">{j.jobType}</td>
              <td className="px-4 py-3 text-xs text-neutral-800 dark:text-neutral-200 max-w-[14rem]">
                <span className="line-clamp-2" title={formatTriggerLabel(j)}>
                  {formatTriggerLabel(j)}
                </span>
              </td>
              <td
                className="px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-400 max-w-[10rem] truncate"
                title={JSON.stringify(j.payload)}
              >
                {JSON.stringify(j.payload)}
              </td>
              <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {formatDateTime(j.createdAt)}
              </td>
              <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {j.startedAt ? formatDateTime(j.startedAt) : "—"}
              </td>
              {showDuration ? (
                <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap tabular-nums">
                  {jobDuration(j)}
                </td>
              ) : null}
              <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                {j.completedAt ? formatDateTime(j.completedAt) : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-red-700 dark:text-red-300 max-w-[12rem] truncate" title={j.errorMessage ?? ""}>
                {j.errorMessage ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
  );

  if (flush) {
    return <div className="overflow-x-auto">{table}</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200/90 dark:border-neutral-800">{table}</div>
  );
}

function SectionShell({
  icon: Icon,
  title,
  subtitle,
  children,
  flush,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** When true, body content is not inset — use with a flush JobTable so one card reads as a single surface. */
  flush?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-soft-lg overflow-hidden">
      <div className="border-b border-neutral-100 dark:border-neutral-800 bg-gradient-to-r from-neutral-50/80 to-white dark:from-neutral-800/40 dark:to-neutral-900 px-6 py-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-700/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 ring-1 ring-primary-700/15 dark:ring-primary-400/20">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className={flush ? undefined : "p-6"}>{children}</div>
    </section>
  );
}

function useAgoLabel(updatedAt: number | null) {
  const [, setT] = useState(0);
  useEffect(() => {
    setT((x) => x + 1);
  }, [updatedAt]);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), 4000);
    return () => window.clearInterval(id);
  }, [updatedAt]);
  if (updatedAt == null) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function AdminBackgroundJobsPageContent() {
  const [activeJobs, setActiveJobs] = useState<BackgroundJobRow[]>([]);
  const [completedJobs, setCompletedJobs] = useState<BackgroundJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [rawOpen, setRawOpen] = useState(false);
  const [rawTitle, setRawTitle] = useState("");
  const [rawBody, setRawBody] = useState("");

  const [queuePageSize, setQueuePageSize] = useState<JobPageSize>(10);
  const [queuePage, setQueuePage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<JobPageSize>(10);
  const [historyPage, setHistoryPage] = useState(1);

  const agoLabel = useAgoLabel(lastUpdatedAt);

  const queueJobs = useMemo(
    () => activeJobs.filter((j) => j.status === "pending" || j.status === "processing"),
    [activeJobs],
  );

  const queueSlice = useMemo(() => {
    if (queuePageSize === "all") return queueJobs;
    const start = (queuePage - 1) * queuePageSize;
    return queueJobs.slice(start, start + queuePageSize);
  }, [queueJobs, queuePage, queuePageSize]);

  const historySlice = useMemo(() => {
    if (historyPageSize === "all") return completedJobs;
    const start = (historyPage - 1) * historyPageSize;
    return completedJobs.slice(start, start + historyPageSize);
  }, [completedJobs, historyPage, historyPageSize]);

  useEffect(() => {
    setQueuePage((p) => {
      const ps = queuePageSize === "all" ? Math.max(queueJobs.length, 1) : queuePageSize;
      const tp = Math.max(1, Math.ceil(queueJobs.length / ps));
      return p > tp ? tp : p;
    });
  }, [queueJobs.length, queuePageSize]);

  useEffect(() => {
    setHistoryPage((p) => {
      const ps = historyPageSize === "all" ? Math.max(completedJobs.length, 1) : historyPageSize;
      const tp = Math.max(1, Math.ceil(completedJobs.length / ps));
      return p > tp ? tp : p;
    });
  }, [completedJobs.length, historyPageSize]);

  const metrics = useMemo(() => {
    const pending = queueJobs.filter((j) => j.status === "pending").length;
    const processing = queueJobs.filter((j) => j.status === "processing").length;
    const ok = completedJobs.filter((j) => j.status === "completed").length;
    const bad = completedJobs.filter((j) => j.status === "failed").length;
    return { pending, processing, ok, bad };
  }, [queueJobs, completedJobs]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (silent) {
      setSilentRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const activeRes = await api.get<BackgroundJobsResponse>("/admin/background-jobs?limit=500");
      setActiveJobs(activeRes.jobs);

      const histRes = await api.get<BackgroundJobsResponse>("/admin/background-jobs?include_completed=true&limit=500");
      const finished = sortFinishedJobs(
        histRes.jobs.filter((j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled"),
      );
      setCompletedJobs(finished);
      setError(null);
    } catch (e) {
      if (!silent) {
        setActiveJobs([]);
        setCompletedJobs([]);
        setError(e instanceof Error ? e.message : "Failed to load jobs.");
      }
    } finally {
      setLastUpdatedAt(Date.now());
      if (silent) {
        setSilentRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const fetchDetail = useCallback((id: string, opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    api
      .get<JobDetailResponse>(`/admin/background-jobs/${id}`)
      .then((r) => setDetail(r.job))
      .catch((e) => {
        if (!silent) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : "Failed to load job.");
        }
      })
      .finally(() => {
        if (!silent) setDetailLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    fetchDetail(detailId);
  }, [detailId, fetchDetail]);

  useEffect(() => {
    if (!detailId) return;
    const id = window.setInterval(() => {
      fetchDetail(detailId, { silent: true });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [detailId, fetchDetail]);

  const openRaw = (title: string, body: unknown) => {
    setRawTitle(title);
    setRawBody(formatJson(body));
    setRawOpen(true);
  };

  const closeDetail = () => {
    setDetailId(null);
    setRawOpen(false);
    void load({ silent: true });
  };

  const handleQueuePageSizeChange = useCallback((size: JobPageSize) => {
    setQueuePageSize(size);
    setQueuePage(1);
  }, []);

  const handleHistoryPageSizeChange = useCallback((size: JobPageSize) => {
    setHistoryPageSize(size);
    setHistoryPage(1);
  }, []);

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5 shadow-soft-lg">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">Jobs</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            Refreshes every {POLL_MS / 1000}s and on tab focus ·{" "}
            {silentRefreshing ? "Syncing…" : `Updated ${agoLabel}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-neutral-50/80 px-2 py-1 text-[11px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300"
            aria-live="polite"
          >
            <IconPulse />
            <span>Live</span>
          </div>
          <Button asChild href={ROUTES.ADMIN_SETTINGS} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
            <>
              <IconSliders className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              Settings
            </>
          </Button>
        </div>
      </header>

      <JobMetricsCompactRail
        pending={metrics.pending}
        processing={metrics.processing}
        succeeded={metrics.ok}
        failed={metrics.bad}
      />

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200/90 dark:border-red-900/50 bg-gradient-to-r from-red-50 to-white dark:from-red-950/40 dark:to-neutral-900 px-5 py-4 text-sm text-red-800 dark:text-red-200 shadow-soft-lg"
        >
          {error}
        </div>
      )}

      <div className="space-y-8">
        <SectionShell
          icon={IconQueue}
          title="Active queue"
          subtitle="Pending and processing jobs across all registered types. Select a row for full detail."
          flush
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 border-t border-neutral-100 bg-neutral-50/30 px-6 py-16 dark:border-neutral-800 dark:bg-neutral-800/20">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading queue…</p>
            </div>
          ) : queueJobs.length === 0 ? (
            <div className="border-t border-neutral-100 bg-neutral-50/40 px-6 py-14 text-center dark:border-neutral-800 dark:bg-neutral-800/25">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Queue is clear</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                There are no pending or running jobs right now. New work will appear here automatically.
              </p>
            </div>
          ) : (
            <>
              <JobTable jobs={queueSlice} onRowClick={setDetailId} flush />
              <JobTableFooter
                total={queueJobs.length}
                page={queuePage}
                pageSize={queuePageSize}
                onPageChange={setQueuePage}
                onPageSizeChange={handleQueuePageSizeChange}
                selectId="jobs-queue-page-size"
                summaryLabel="Active queue table footer"
              />
            </>
          )}
        </SectionShell>

        <SectionShell
          icon={IconHistory}
          title="History"
          subtitle="Completed, failed, and cancelled jobs in this window (newest first). Ticket/todo/time/link creates appear as ticket_create, todo_create, time_entry_create_*, link_create."
          flush
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 border-t border-neutral-100 bg-neutral-50/30 px-6 py-12 dark:border-neutral-800 dark:bg-neutral-800/20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading history…</p>
            </div>
          ) : completedJobs.length === 0 ? (
            <div className="border-t border-neutral-100 bg-neutral-50/40 px-6 py-14 text-center dark:border-neutral-800 dark:bg-neutral-800/25">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">No history yet</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                Finished jobs will show here after the worker processes them.
              </p>
            </div>
          ) : (
            <>
              <JobTable jobs={historySlice} onRowClick={setDetailId} showDuration flush />
              <JobTableFooter
                total={completedJobs.length}
                page={historyPage}
                pageSize={historyPageSize}
                onPageChange={setHistoryPage}
                onPageSizeChange={handleHistoryPageSizeChange}
                selectId="jobs-history-page-size"
                summaryLabel="History table footer"
              />
            </>
          )}
        </SectionShell>
      </div>

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && closeDetail()} title="Job details" className="sm:max-w-xl">
        <div className="px-5 sm:px-7 pb-6 space-y-4">
          {detailLoading && (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
            </div>
          )}
          {detailError && <p className="text-sm text-red-600 dark:text-red-400">{detailError}</p>}
          {!detailLoading && detail && (
            <>
              <dl>
                <Def label="Job ID">
                  <span className="font-mono text-xs">{detail.id}</span>
                </Def>
                <Def label="Type">
                  <span className="font-mono text-xs">{detail.jobType}</span>
                </Def>
                <Def label="Status">
                  <Badge className={statusBadgeClass(detail.status)}>{detail.status}</Badge>
                </Def>
                <Def label="Outcome">
                  {detail.status === "completed" && detail.success && (
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">Completed successfully</span>
                  )}
                  {detail.status === "failed" && <span className="text-red-700 dark:text-red-300 font-medium">Failed</span>}
                  {detail.status === "pending" && <span className="text-amber-700 dark:text-amber-300">Pending</span>}
                  {detail.status === "processing" && <span className="text-sky-700 dark:text-sky-300">Running</span>}
                  {detail.status === "cancelled" && <span>Cancelled</span>}
                </Def>
                <Def label="Triggered by">
                  {detail.createdBy ? (
                    <div className="space-y-1">
                      <p>
                        <span className="font-medium">{detail.createdBy.name?.trim() || detail.createdBy.email}</span>
                        {detail.createdBy.name?.trim() && (
                          <span className="text-neutral-500 dark:text-neutral-400"> ({detail.createdBy.email})</span>
                        )}
                      </p>
                      <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">id: {detail.createdBy.id}</p>
                      <Link
                        to={`${ROUTES.ADMIN_USERS}/${detail.createdBy.id}`}
                        className="text-primary-600 dark:text-primary-400 text-xs font-medium hover:underline"
                      >
                        Open user in admin
                      </Link>
                    </div>
                  ) : detail.createdByUserId ? (
                    <span className="font-mono text-xs">User id: {detail.createdByUserId} (account missing)</span>
                  ) : (
                    <span className="text-neutral-500">System / unknown</span>
                  )}
                </Def>
                <Def label="Priority">{detail.priority}</Def>
                <Def label="Created">{formatDateTime(detail.createdAt)}</Def>
                <Def label="Updated">{formatDateTime(detail.updatedAt)}</Def>
                <Def label="Started">{detail.startedAt ? formatDateTime(detail.startedAt) : "—"}</Def>
                <Def label="Completed">{detail.completedAt ? formatDateTime(detail.completedAt) : "—"}</Def>
                <Def label="Dedupe key">{detail.dedupeKey ?? "—"}</Def>
                {detail.errorMessage && (
                  <Def label="Error message">
                    <span className="text-red-700 dark:text-red-300 whitespace-pre-wrap">{detail.errorMessage}</span>
                  </Def>
                )}
              </dl>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openRaw("Raw payload", detail.payload)}>
                  Raw payload
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => openRaw("Raw job (API)", detail)}>
                  Raw job record
                </Button>
                {detail.result != null && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openRaw("Raw result", detail.result)}>
                    Raw result
                  </Button>
                )}
              </div>

              {detail.result?.link && (
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 bg-gradient-to-br from-neutral-50 to-white dark:from-neutral-800/50 dark:to-neutral-900/80">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Result (link snapshot)</h3>
                  {detail.result.note && <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">{detail.result.note}</p>}
                  <p className="text-sm">
                    <span className="text-neutral-500">Title:</span>{" "}
                    <span className="font-medium">{detail.result.link.title ?? "—"}</span>
                  </p>
                  <p className="text-sm mt-1 break-all">
                    <span className="text-neutral-500">URL:</span>{" "}
                    <a
                      href={detail.result.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {detail.result.link.url}
                    </a>
                  </p>
                  <p className="text-xs font-mono text-neutral-500 mt-1">Link id: {detail.result.link.id}</p>
                  {detail.result.link.metadataExtractedAt && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      Metadata extracted at: {formatDateTime(detail.result.link.metadataExtractedAt)}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to={`${ROUTES.LINKS}/${detail.result.link.id}`}
                      className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Open link in dashboard
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>

      <Dialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        title={rawTitle}
        description="JSON as returned or stored by the server."
        className="sm:max-w-3xl z-[100]"
      >
        <div className="px-5 sm:px-7 pb-6">
          <pre className="text-xs font-mono bg-neutral-100 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 rounded-xl p-4 max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap break-all ring-1 ring-neutral-200/80 dark:ring-neutral-800">
            {rawBody}
          </pre>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setRawOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function AdminBackgroundJobsPage() {
  const { can } = useAuth();
  if (!can("admin.jobs.view")) {
    return (
      <AccessDeniedWarning
        message="You need the View Background Jobs permission to open this page."
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }
  return <AdminBackgroundJobsPageContent />;
}
