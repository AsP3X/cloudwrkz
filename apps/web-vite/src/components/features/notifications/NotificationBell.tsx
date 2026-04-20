import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { cn } from "@/lib/utils/cn";

interface NotificationEntry {
  id: string;
  title: string;
  body?: string | null;
  read: boolean;
  resourceUrl?: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30_000;

function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffDays = Math.floor(diffH / 24);
  return `${diffDays}d ago`;
}

type NotificationBellProps = {
  /** ~75%-scale hit target when the dashboard header is compact while scrolled. */
  compact?: boolean;
};

export function NotificationBell({ compact = false }: NotificationBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [marking, setMarking] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const data = await api.get<{ notifications: NotificationEntry[]; unreadCount: number }>("/notifications?limit=15");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  React.useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
    setMarking(false);
  };

  const handleNotificationClick = async (n: NotificationEntry) => {
    if (!n.read) await handleMarkRead(n.id);
    setOpen(false);
    if (n.resourceUrl) navigate(n.resourceUrl);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center rounded-lg transition-all duration-300 ease-out",
          compact ? "h-8 w-8" : "h-9 w-9",
          "text-neutral-600 dark:text-neutral-400",
          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          open && "bg-neutral-100 dark:bg-neutral-800",
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <svg
          className={cn(
            "transition-[width,height] duration-300 ease-out",
            compact ? "h-[1.125rem] w-[1.125rem]" : "h-5 w-5",
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} role="presentation" />
          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-800 z-[100] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-medium">
                    {unreadCount}
                  </span>
                )}
              </h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={marking}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
              {loading && notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-600">Loading…</div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-600">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800",
                      !n.read && "bg-primary-50/60 dark:bg-primary-950/30"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400" aria-hidden />
                      )}
                      <div className={cn("flex-1 min-w-0", n.read && "pl-3.5")}>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{n.title}</p>
                        {n.body && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">{n.body}</p>
                        )}
                        <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-1">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
                <Link
                  to="/dashboard/notifications"
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  View all notifications →
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
