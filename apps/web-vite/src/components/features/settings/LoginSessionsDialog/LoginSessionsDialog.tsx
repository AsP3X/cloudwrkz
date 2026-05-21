import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { formatDateTimeFull } from "@/lib/utils/date";
import { api } from "@/api/client";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";
import { clearUserCache } from "@/lib/auth/userCache";

// Human: React UI for `LoginSessionsDialog` in account, privacy, and session settings: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE settings; SECURITY sessions delete-account; EXPORTS LoginSessionsDialog; REACT component; READS props hooks; MAY CALL api client.
interface MySession {
  id: string;
  isCurrent: boolean;
  deviceName: string | null;
  deviceType: string | null;
  deviceOs: string | null;
  deviceBrowser: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

interface LoginSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LoginSessionsDialog = ({ open, onOpenChange }: LoginSessionsDialogProps) => {
  const navigate = useNavigate();
  const [sessions, setSessions] = React.useState<MySession[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ sessions: MySession[] }>("/me/sessions");
      setSessions(result.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void loadSessions();
    }
  }, [open, loadSessions]);

  const handleRevokeSession = async (sessionId: string) => {
    setActionLoading(sessionId);
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/me/sessions/${sessionId}`);
      setSuccess("Session revoked successfully");
      await loadSessions();

      const stillHasCurrent = sessions?.some((s) => s.isCurrent);
      if (!stillHasCurrent) {
        localStorage.removeItem("auth_token");
        clearUserCache();
        navigate(ROUTES.LOGIN);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setActionLoading("revoke-others");
    setError(null);
    setSuccess(null);
    try {
      await api.delete("/me/sessions/others");
      setSuccess("Other sessions revoked successfully");
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke other sessions");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeAllSessions = async () => {
    setActionLoading("revoke-all");
    setError(null);
    setSuccess(null);
    try {
      await api.delete("/me/sessions");
      setSuccess("All sessions revoked successfully");
      localStorage.removeItem("auth_token");
      clearUserCache();
      navigate(ROUTES.LOGIN);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions");
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0) {
      return "Expired";
    }
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? "s" : ""}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""}`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins} minute${diffMins > 1 ? "s" : ""}`;
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
      setSuccess(null);
    }
    onOpenChange(nextOpen);
  };

  const now = new Date();
  const activeSessions = sessions?.filter((s) => new Date(s.expiresAt) > now) ?? [];
  const expiredSessions = sessions?.filter((s) => new Date(s.expiresAt) <= now) ?? [];

  const currentSession = activeSessions.find((s) => s.isCurrent) || null;
  const otherSessions = activeSessions.filter((s) => !s.isCurrent);

  const formatDeviceLabel = (session: MySession) => {
    if (session.deviceName) return session.deviceName;

    const parts: string[] = [];
    if (session.deviceOs) parts.push(session.deviceOs);
    else if (session.deviceType) parts.push(session.deviceType);
    if (session.deviceBrowser) parts.push(session.deviceBrowser);

    if (parts.length > 0) return parts.join(" \u00B7 ");

    const ua = session.userAgent?.trim();
    if (ua) {
      return ua.length <= 80 ? ua : `${ua.slice(0, 77)}…`;
    }

    return "Unknown device";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Login sessions"
      description="See where you're logged in, manage your active sessions, and remove expired ones."
    >
      <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Status messages */}
        {error && (
          <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-3 text-sm text-error-800 dark:text-error-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-3 text-sm text-success-800 dark:text-success-200">
            {success}
          </div>
        )}

        {/* Intro + bulk actions */}
        <div className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Each login on a browser or device creates a session. You can log out of other devices while
            keeping this one active, or log out of all sessions.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRevokeOtherSessions}
              disabled={actionLoading !== null || loading || otherSessions.length === 0}
            >
              {actionLoading === "revoke-others" ? "Logging out other sessions..." : "Log out of other sessions"}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleRevokeAllSessions}
              disabled={actionLoading !== null || loading || !sessions || sessions.length === 0}
            >
              {actionLoading === "revoke-all" ? "Logging out everywhere..." : "Log out of all sessions"}
            </Button>
          </div>
        </div>

        {/* Sessions list */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/70">
          {loading ? (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">Loading sessions…</div>
          ) : !sessions || sessions.length === 0 ? (
            <div className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
              You have no sessions.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {/* Active sessions */}
              <div>
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Active sessions
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {activeSessions.length} active
                  </p>
                </div>

                {activeSessions.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
                    You have no active sessions.
                  </div>
                ) : (
                  <>
                    {currentSession && (
                      <div className="p-4 bg-primary-50/60 dark:bg-primary-900/20">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                                {formatDeviceLabel(currentSession)}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-primary-100 dark:bg-primary-900 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:text-primary-300">
                                Current session
                              </span>
                            </div>
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              Signed in {formatDateTimeFull(currentSession.createdAt)} · Expires in{" "}
                              {formatTimeRemaining(currentSession.expiresAt)}
                              {currentSession.ipAddress ? ` · IP ${currentSession.ipAddress}` : null}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleRevokeSession(currentSession.id)}
                            disabled={actionLoading === currentSession.id}
                            className={cn("w-full sm:w-auto mt-3 sm:mt-0")}
                          >
                            {actionLoading === currentSession.id ? "Logging out…" : "Log out"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {otherSessions.map((session) => (
                      <div key={session.id} className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {formatDeviceLabel(session)}
                            </p>
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              Signed in {formatDateTimeFull(session.createdAt)} · Expires in{" "}
                              {formatTimeRemaining(session.expiresAt)}
                              {session.ipAddress ? ` · IP ${session.ipAddress}` : null}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn("whitespace-nowrap w-full sm:w-auto mt-3 sm:mt-0")}
                            onClick={() => handleRevokeSession(session.id)}
                            disabled={actionLoading === session.id}
                          >
                            {actionLoading === session.id ? "Logging out…" : "Log out"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Expired sessions */}
              <div>
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Expired sessions
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {expiredSessions.length} expired
                  </p>
                </div>

                {expiredSessions.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
                    You have no expired sessions.
                  </div>
                ) : (
                  expiredSessions.map((session) => (
                    <div key={session.id} className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {formatDeviceLabel(session)}
                            {session.isCurrent ? " (this device)" : ""}
                          </p>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400">
                            Signed in {formatDateTimeFull(session.createdAt)} · Expired on{" "}
                            {formatDateTimeFull(session.expiresAt)}
                            {session.ipAddress ? ` · IP ${session.ipAddress}` : null}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn("whitespace-nowrap w-full sm:w-auto mt-3 sm:mt-0")}
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={actionLoading === session.id}
                        >
                          {actionLoading === session.id ? "Removing…" : "Remove"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
