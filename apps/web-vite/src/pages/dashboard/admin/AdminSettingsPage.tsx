import { useState, useEffect, useCallback } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

const MIN_QR_REQUESTS_PER_MINUTE = 1;
const MAX_QR_REQUESTS_PER_MINUTE = 120;
const LINKS_DEFAULT_PAGE_SIZE_VALUES = [10, 25, 50, 100, 10000] as const;
const LINK_PAGE_SIZE_ALL = 10000;

type AdminSettingsData = {
  systemInfo: {
    totalUsers: number;
    totalTickets: number;
    totalGroups: number;
    totalModules: number;
    enabledModules: number;
    activeSessions: number;
  };
  databaseStats: {
    users: number;
    sessions: number;
    tickets: number;
    ticketComments: number;
    groups: number;
    groupMemberships: number;
    modules: number;
  };
  health: {
    status: "healthy" | "degraded" | "unhealthy";
    checks: { database: boolean; sessions: boolean; modules: boolean };
    message: string;
  };
  linksDefaultPageSize: number;
  qrLoginRequestsPerMinute: number;
  diagnosticsHealthToken?: {
    configured: boolean;
    source: "none" | "environment" | "database" | "both";
  };
};

const CARD_CLASS =
  "bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6";

export default function AdminSettingsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<AdminSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    message: string;
    deletedCount: number;
  } | null>(null);
  const [linksDefaultPageSize, setLinksDefaultPageSize] = useState(50);
  const [linksPageSizeSaving, setLinksPageSizeSaving] = useState(false);
  const [linksPageSizeMessage, setLinksPageSizeMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [qrLoginRequestsPerMinute, setQrLoginRequestsPerMinute] = useState(20);
  const [qrSaving, setQrSaving] = useState(false);
  const [qrMessage, setQrMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [diagRotating, setDiagRotating] = useState(false);
  const [diagMessage, setDiagMessage] = useState<{
    type: "success" | "error";
    text: string;
    token?: string;
  } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get<AdminSettingsData>("/admin/settings");
      setData(res);
      if (res) {
        setLinksDefaultPageSize(res.linksDefaultPageSize ?? 50);
        setQrLoginRequestsPerMinute(
          Math.min(
            MAX_QR_REQUESTS_PER_MINUTE,
            Math.max(MIN_QR_REQUESTS_PER_MINUTE, res.qrLoginRequestsPerMinute ?? 20)
          )
        );
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleLinksDefaultPageSizeSave = async () => {
    setLinksPageSizeSaving(true);
    setLinksPageSizeMessage(null);
    try {
      await api.patch("/admin/settings/links-page-size", { value: linksDefaultPageSize });
      setLinksPageSizeMessage({ type: "success", text: "Links default page size saved." });
      fetchSettings();
    } catch (err) {
      setLinksPageSizeMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setLinksPageSizeSaving(false);
    }
  };

  const handleQrLoginRequestsPerMinuteSave = async () => {
    setQrSaving(true);
    setQrMessage(null);
    try {
      await api.patch("/admin/settings/qr-login-rate-limit", {
        value: qrLoginRequestsPerMinute,
      });
      setQrMessage({ type: "success", text: "QR code rate limit saved." });
      fetchSettings();
    } catch (err) {
      setQrMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      });
    } finally {
      setQrSaving(false);
    }
  };

  const handleRotateDiagnosticsToken = async () => {
    if (
      !confirm(
        "Generate a new diagnostics API token? The previous database-stored token will stop working. (A token from DIAGNOSTICS_HEALTH_TOKEN in server env is not changed.)"
      )
    ) {
      return;
    }
    setDiagRotating(true);
    setDiagMessage(null);
    try {
      const res = await api.post<{ token?: string; message?: string }>(
        "/admin/settings/diagnostics-health-token",
        {}
      );
      setDiagMessage({
        type: "success",
        text:
          res.message ??
          "Token created. Copy it now—it is only shown once.",
        token: res.token,
      });
      fetchSettings();
    } catch (err) {
      setDiagMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate token.",
      });
    } finally {
      setDiagRotating(false);
    }
  };

  const handlePurge = async () => {
    if (
      !confirm(
        "Are you sure you want to purge deleted accounts? This action cannot be undone."
      )
    ) {
      return;
    }
    setIsPurging(true);
    setPurgeResult(null);
    try {
      const res = await api.post<{ message: string; deletedCount: number }>(
        "/admin/purge-deleted-accounts"
      );
      setPurgeResult({
        message: res.message ?? "Done",
        deletedCount: res.deletedCount ?? 0,
      });
      fetchSettings();
    } catch (err) {
      setPurgeResult({
        message: err instanceof Error ? err.message : "Purge failed",
        deletedCount: 0,
      });
    } finally {
      setIsPurging(false);
    }
  };

  if (!can("admin.settings.manage")) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to access system settings."
        title="Access denied"
        primaryLabel="Back to Dashboard"
        primaryHref={ROUTES.DASHBOARD}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className={CARD_CLASS}>
        <p className="text-neutral-600 dark:text-neutral-400">
          Failed to load system settings.
        </p>
      </div>
    );
  }

  const { systemInfo, databaseStats, health } = data;

  const getHealthBadgeVariant = () => {
    switch (health.status) {
      case "healthy":
        return "success";
      case "degraded":
        return "warning";
      case "unhealthy":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          System Settings
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          System information and configuration
        </p>
      </div>

      {/* System Health */}
      <div className={CARD_CLASS}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            System Health
          </h2>
          <Badge variant={getHealthBadgeVariant()} size="md">
            {health.status.toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          {health.message}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                health.checks.database ? "bg-success-500" : "bg-error-500"
              }`}
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Database
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                health.checks.sessions ? "bg-success-500" : "bg-error-500"
              }`}
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Sessions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                health.checks.modules ? "bg-success-500" : "bg-error-500"
              }`}
            />
            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Modules
            </span>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          System Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Total Users
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.totalUsers}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Total Tickets
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.totalTickets}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Total Groups
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.totalGroups}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Total Modules
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.totalModules}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Enabled Modules
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.enabledModules}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Active Sessions
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {systemInfo.activeSessions}
            </p>
          </div>
        </div>
      </div>

      {/* Database Statistics */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Database Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Users
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.users}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Sessions
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.sessions}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Tickets
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.tickets}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Comments
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.ticketComments}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Groups
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.groups}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Memberships
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.groupMemberships}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Modules
            </p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">
              {databaseStats.modules}
            </p>
          </div>
        </div>
      </div>

      {/* Diagnostics API (detailed health) */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Diagnostics API token
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Full server diagnostics are available at{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            GET /api/v1/health/detailed
          </code>{" "}
          and{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            GET /api/health/detailed
          </code>{" "}
          with header{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            Authorization: Bearer &lt;token&gt;
          </code>
          . The public{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
            /health
          </code>{" "}
          endpoint stays minimal.
        </p>
        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">
          Status:{" "}
          <span className="font-medium">
            {data.diagnosticsHealthToken?.configured
              ? `configured (${data.diagnosticsHealthToken?.source ?? "unknown"})`
              : "not configured — generate a token or set DIAGNOSTICS_HEALTH_TOKEN on the API server"}
          </span>
        </p>
        <Button
          variant="primary"
          onClick={handleRotateDiagnosticsToken}
          loading={diagRotating}
        >
          Generate / rotate database token
        </Button>
        {diagMessage && (
          <div className="mt-4 space-y-2">
            <p
              className={`text-sm ${
                diagMessage.type === "success"
                  ? "text-success-600 dark:text-success-400"
                  : "text-error-600 dark:text-error-400"
              }`}
            >
              {diagMessage.text}
            </p>
            {diagMessage.token ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Copy now (shown once)
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-neutral-900 dark:text-neutral-100">
                  {diagMessage.token}
                </pre>
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
          CLI (same effect):{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            cloudwrkz-api diagnostics-token generate
          </code>{" "}
          or{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            cloudwrkz-cli diagnostics-token generate
          </code>
          {" "}
          (requires <code className="font-mono">DATABASE_URL</code>).
        </p>
      </div>

      {/* QR code login rate limit */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          QR code login
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Maximum number of QR login attempts (new QR codes requested) allowed per
          minute, globally. Helps prevent abuse of the &quot;Sign in with QR code&quot;
          option.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span>Max attempts per minute</span>
            <input
              type="number"
              min={MIN_QR_REQUESTS_PER_MINUTE}
              max={MAX_QR_REQUESTS_PER_MINUTE}
              value={qrLoginRequestsPerMinute}
              onChange={(e) => {
                const v =
                  e.target.value === ""
                    ? MIN_QR_REQUESTS_PER_MINUTE
                    : parseInt(e.target.value, 10);
                if (!Number.isNaN(v))
                  setQrLoginRequestsPerMinute(
                    Math.max(
                      MIN_QR_REQUESTS_PER_MINUTE,
                      Math.min(MAX_QR_REQUESTS_PER_MINUTE, v)
                    )
                  );
              }}
              className="w-24 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <Button
            variant="primary"
            onClick={handleQrLoginRequestsPerMinuteSave}
            loading={qrSaving}
          >
            Save
          </Button>
        </div>
        {qrMessage && (
          <p
            className={`mt-3 text-sm ${
              qrMessage.type === "success"
                ? "text-success-600 dark:text-success-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {qrMessage.text}
          </p>
        )}
      </div>

      {/* Links module default page size */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Links module
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Default number of links per page on the links overview. Users can still
          change the page size on the page (10, 25, 50, 100, or All).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span>Default page size</span>
            <select
              value={linksDefaultPageSize === LINK_PAGE_SIZE_ALL ? "all" : linksDefaultPageSize}
              onChange={(e) =>
                setLinksDefaultPageSize(
                  e.target.value === "all"
                    ? LINK_PAGE_SIZE_ALL
                    : parseInt(e.target.value, 10)
                )
              }
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {LINKS_DEFAULT_PAGE_SIZE_VALUES.map((n) => (
                <option key={n} value={n}>
                  {n === LINK_PAGE_SIZE_ALL ? "All" : n}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            onClick={handleLinksDefaultPageSizeSave}
            loading={linksPageSizeSaving}
          >
            Save
          </Button>
        </div>
        {linksPageSizeMessage && (
          <p
            className={`mt-3 text-sm ${
              linksPageSizeMessage.type === "success"
                ? "text-success-600 dark:text-success-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {linksPageSizeMessage.text}
          </p>
        )}
      </div>

      {/* Purge Deleted Accounts */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Purge Deleted Accounts
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Permanently delete accounts that have been marked for deletion for more than
          30 days. This action cannot be undone.
        </p>
        {purgeResult && (
          <div
            className={`p-3 rounded-lg mb-4 ${
              purgeResult.deletedCount > 0
                ? "bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800"
                : "bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <p
              className={`text-sm ${
                purgeResult.deletedCount > 0
                  ? "text-success-700 dark:text-success-300"
                  : "text-neutral-700 dark:text-neutral-300"
              }`}
            >
              {purgeResult.message}
            </p>
          </div>
        )}
        <Button variant="danger" onClick={handlePurge} loading={isPurging}>
          Purge Deleted Accounts
        </Button>
      </div>
    </div>
  );
}
