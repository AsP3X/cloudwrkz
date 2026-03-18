import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { cn } from "@/lib/utils/cn";

interface NotificationEntry {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  read: boolean;
  resourceUrl?: string | null;
  createdAt: string;
}

function formatRelativeTime(date: Date | string): string {
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

const typeLabel: Record<string, string> = {
  TICKET_ASSIGNED: "Ticket Assigned",
  TICKET_STATUS_CHANGED: "Status Changed",
  TICKET_COMMENT_ADDED: "New Comment",
  TODO_ASSIGNED: "Todo Assigned",
  UNBAN_REVIEWED: "Unban Reviewed",
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<{ notifications: NotificationEntry[]; unreadCount: number }>("/notifications?limit=50");
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

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

  const handleClick = async (n: NotificationEntry) => {
    if (!n.read) await handleMarkRead(n.id);
    if (n.resourceUrl) navigate(n.resourceUrl);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Notifications</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">Your recent activity and updates.</p>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Notifications</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Your recent activity and updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={marking}
            className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 disabled:opacity-50 transition-colors"
          >
            {marking ? "Marking…" : "Mark all as read"}
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
        {notifications.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-neutral-500 dark:text-neutral-400 font-medium">You&apos;re all caught up!</p>
            <p className="text-sm text-neutral-400 dark:text-neutral-600 mt-1">No notifications yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-5 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800",
                    !n.read && "bg-primary-50/50 dark:bg-primary-950/20"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {!n.read && (
                      <span className="mt-2 flex-shrink-0 w-2 h-2 rounded-full bg-primary-500 dark:bg-primary-400" aria-hidden />
                    )}
                    <div className={cn("flex-1 min-w-0", n.read && "pl-5")}>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {typeLabel[n.type] ?? n.type}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-neutral-600">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleMarkRead(n.id); }}
                        className="flex-shrink-0 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
                        aria-label="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
