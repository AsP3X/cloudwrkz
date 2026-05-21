import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { Todo, Link as LinkType, Ticket } from "@/lib/types";
import {
  WelcomeHero,
  DashboardStatCard,
  DashboardTodoWidget,
  DashboardPinnedFavorites,
  RecentActivityPanel,
  DashboardNotificationsAlerts,
  type DashboardTodoItem,
  type DashboardFavoriteItem,
  type DashboardAlert,
  type RecentSection,
} from "@/components/features/dashboard";
import { AdminDashboard } from "@/components/features/admin/AdminDashboard";
import { hasAdminAreaAccess } from "@/lib/permissions";

// Human: Authenticated home dashboard that aggregates tickets, todos, favorites, and admin widgets in one hub.
// Agent: READS useAuth user+modules; FETCHES api dashboard endpoints; BRANCHES AdminDashboard when admin module; SETS loading states.

const IconTicket = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconMail = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconClock = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Human: Default dashboard route wiring data fetches into the widget grid and role-aware admin summaries.
// Agent: useEffect loads ticket/todo/favorite/time counts; RENDERS feature dashboard components; NULL-safe counts.

export default function DashboardHomePage() {
  const { user, modules, can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [todoItems, setTodoItems] = useState<DashboardTodoItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<DashboardFavoriteItem[]>([]);
  const [timeTrackingActiveCount, setTimeTrackingActiveCount] = useState<number | null>(null);
  const [alerts] = useState<DashboardAlert[]>([]);
  const [recentSections] = useState<RecentSection[]>([]);

  const displayName = user?.name || user?.email?.split("@")[0] || "User";

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Human: Users with any admin-area permission see AdminDashboard instead of the standard widget hub.
      // Agent: hasAdminAreaAccess(can) short-circuits widget fetches; SKIPS ticket/todo loads for admin home.
      if (hasAdminAreaAccess(can)) {
        setLoading(false);
        return;
      }
      const promises: Promise<void>[] = [];

      if (modules.includes("tickets")) {
        promises.push(
          api.get<{ tickets: Ticket[] }>("/tickets?status=UNRESOLVED")
            .then((d) => setTicketCount(Array.isArray(d?.tickets) ? d.tickets.length : 0))
            .catch(() => setTicketCount(0))
        );
      }

      if (modules.includes("todos")) {
        promises.push(
          api.get<{ todos: Todo[] }>("/todos")
            .then((d) => {
              const active = (Array.isArray(d?.todos) ? d.todos : [])
                .filter((t) => t.status === "NOT_STARTED" || t.status === "IN_PROGRESS")
                .slice(0, 5);
              setTodoItems(active.map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                href: ROUTES.TODOS,
                dueDate: t.due_date,
              })));
            })
            .catch(() => {})
        );
      }

      if (modules.includes("links")) {
        promises.push(
          api.get<{ links: LinkType[] }>("/links?is_favorite=true&limit=5")
            .then((d) => {
              setFavoriteItems(d.links.map((l) => ({
                id: l.id,
                title: l.title,
                url: l.url,
                href: l.url,
              })));
            })
            .catch(() => {})
        );
      }

      if (modules.includes("time_tracking")) {
        promises.push(
          api.get<{ timeEntries: unknown[] }>("/time-tracking?status=RUNNING")
            .then((d) => setTimeTrackingActiveCount(Array.isArray(d?.timeEntries) ? d.timeEntries.length : 0))
            .catch(() => setTimeTrackingActiveCount(0))
        );
      }

      await Promise.allSettled(promises);
      setLoading(false);
    }
    load();
  }, [modules, can]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (hasAdminAreaAccess(can)) {
    return (
      <AdminDashboard
        displayName={displayName}
      />
    );
  }

  return (
    <div className="space-y-6">
      <WelcomeHero
        name={displayName}
        role={(user?.role as "USER" | "AGENT" | "ADMIN" | "MODERATOR") || "USER"}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.includes("tickets") && (
          <DashboardStatCard
            title="Unresolved tickets"
            value={ticketCount ?? "—"}
            href={ROUTES.TICKETS}
            icon={<IconTicket />}
            accent="primary"
          />
        )}
        {modules.includes("time_tracking") && (
          <DashboardStatCard
            title="Active timers"
            value={timeTrackingActiveCount ?? "—"}
            href="/dashboard/time-tracking"
            icon={<IconClock />}
            accent="secondary"
          />
        )}
        <DashboardStatCard
          title="Account & email"
          value={
            user?.status
              ? `${user.status.charAt(0)}${user.status.slice(1).toLowerCase()}`
              : "—"
          }
          subtitle={
            user?.emailVerified ? "Email verified" : "Email not verified yet"
          }
          icon={<IconMail />}
          accent={user?.emailVerified ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {modules.includes("todos") && (
          <DashboardTodoWidget
            items={todoItems}
            viewAllHref={ROUTES.TODOS}
          />
        )}
        {modules.includes("links") && (
          <DashboardPinnedFavorites
            items={favoriteItems}
            viewAllHref={ROUTES.LINKS}
          />
        )}
      </div>

      {alerts.length > 0 && <DashboardNotificationsAlerts alerts={alerts} />}

      <RecentActivityPanel
        sections={recentSections.length > 0 ? recentSections : [
          { title: "Continue where you left off", items: [], emptyMessage: "Nothing recent." },
        ]}
        title="Recent activity"
      />
    </div>
  );
}
