import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import type { AuditEntry, AuditEntryResponse } from "@/lib/types";
import { formatDateTimeFull } from "@/lib/utils/date";

const CARD_CLASS =
  "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6";

// Human: Audit entry detail page using the same layout pattern as customer detail—header, stat cards, and sectioned fields.
// Agent: FETCH GET /admin/audit/entries/:id; REQUIRES audit.view; RENDERS CustomerDetailPage-style header/stats/grid sections.

function actionVariant(action: string) {
  if (action.includes("create") || action.includes("register")) return "success" as const;
  if (action.includes("delete") || action.includes("ban")) return "error" as const;
  if (action.includes("update") || action.includes("change") || action.includes("revoke") || action.includes("grant")) {
    return "warning" as const;
  }
  if (action.includes("login")) return "info" as const;
  return "default" as const;
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1 break-all">
        {value ?? <span className="text-neutral-400 dark:text-neutral-500">—</span>}
      </p>
    </div>
  );
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewAudit = can("audit.view");

  const fetchEntry = useCallback(async () => {
    if (!canViewAudit || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AuditEntryResponse>(`/admin/audit/entries/${encodeURIComponent(id)}`);
      setEntry(res.entry);
    } catch {
      setEntry(null);
      setError("Audit log entry not found or could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canViewAudit, id]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const stats = useMemo(() => {
    if (!entry) {
      return {
        resourceLabel: "—",
        actorLabel: "—",
        ipLabel: "—",
        contextFieldCount: 0,
      };
    }

    const contextFieldCount =
      entry.context != null && typeof entry.context === "object" ? Object.keys(entry.context).length : 0;

    return {
      resourceLabel: entry.resource_type ?? "None",
      actorLabel: entry.user ? entry.user.name || entry.user.email : entry.user_id ? "User ID only" : "System",
      ipLabel: entry.ip_address ?? "—",
      contextFieldCount,
    };
  }, [entry]);

  if (!user) {
    return (
      <div className={`${CARD_CLASS} text-center`}>
        <p className="text-neutral-500">Please sign in.</p>
      </div>
    );
  }

  if (!canViewAudit) {
    return (
      <div className={`${CARD_CLASS} text-center`}>
        <p className="text-neutral-500">Access denied. View audit log permission required.</p>
      </div>
    );
  }

  if (loading || !id) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-600 dark:text-neutral-400">{error ?? "Audit log entry not found."}</p>
        <Button variant="outline" onClick={() => navigate(ROUTES.ADMIN_AUDIT)}>
          Back to Audit Log
        </Button>
      </div>
    );
  }

  const userDisplay = entry.user ? (
    <>
      {entry.user.name || entry.user.email}
      {entry.user.email && entry.user.name ? (
        <span className="block text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{entry.user.email}</span>
      ) : null}
    </>
  ) : entry.user_id ? (
    <span className="font-mono text-sm">{entry.user_id}</span>
  ) : (
    "System"
  );

  return (
    <div className="space-y-6">
      {/* Header — aligned with CustomerDetailPage */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            to={ROUTES.ADMIN_AUDIT}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block"
          >
            ← Back to Audit Log
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{entry.action}</h1>
            <Badge variant={actionVariant(entry.action)} size="md">
              {entry.action.split(".")[0] ?? entry.action}
            </Badge>
            {entry.resource_type ? (
              <Badge variant="info" size="md">
                {entry.resource_type}
              </Badge>
            ) : null}
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-mono text-sm">
            {entry.id}
            {entry.created_at ? ` · ${formatDateTimeFull(entry.created_at)}` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Resource</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.resourceLabel}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Actor</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2 truncate" title={stats.actorLabel}>
            {stats.actorLabel}
          </p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">IP address</p>
          <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-2 truncate" title={stats.ipLabel}>
            {stats.ipLabel}
          </p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Context fields</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.contextFieldCount}</p>
        </div>
      </div>

      {/* Event details */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Event Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DetailField label="Time" value={formatDateTimeFull(entry.created_at)} />
          <DetailField label="Action" value={entry.action} />
          <DetailField label="Entry ID" value={<span className="font-mono text-sm">{entry.id}</span>} />
          <DetailField label="User" value={userDisplay} />
          <DetailField label="Resource type" value={entry.resource_type} />
          <DetailField
            label="Resource ID"
            value={entry.resource_id ? <span className="font-mono text-sm">{entry.resource_id}</span> : null}
          />
        </div>
      </div>

      {/* Request metadata */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Request Metadata</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DetailField
            label="IP address"
            value={entry.ip_address ? <span className="font-mono text-sm">{entry.ip_address}</span> : null}
          />
          <DetailField label="User agent" value={entry.user_agent ? <span className="font-mono text-sm">{entry.user_agent}</span> : null} />
        </div>
      </div>

      {/* Context payload */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Context</h2>
        {entry.context != null ? (
          <pre className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(entry.context, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">No additional context recorded for this event.</p>
        )}
      </div>
    </div>
  );
}
