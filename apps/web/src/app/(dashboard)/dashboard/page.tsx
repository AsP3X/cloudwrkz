import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import Link from "next/link";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import type { CurrentUser } from "@/lib/utils/auth-server";
import { getUserPermissions } from "@/lib/utils/permissions";
import {
  WelcomeHero,
  DashboardStatCard,
  RecentActivityPanel,
  DashboardTodoWidget,
  DashboardNotificationsAlerts,
  DashboardPinnedFavorites,
  type RecentSection,
  type DashboardTodoItem,
  type DashboardAlert,
  type DashboardFavoriteItem,
} from "@/components/features/dashboard";
import { getAllTodos } from "@/server/actions/todos";
import { getLinks } from "@/server/actions/links";
import { getRecentlyViewed } from "@/server/actions/sessions";

// Icons for stats and shortcuts (inline to avoid extra imports)
const IconTicket = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconCheck = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconMail = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconPlus = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);
const IconUser = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const IconSettings = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconDoc = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconAlert = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

function ticketStatusClass(status: string) {
  if (status === "OPEN") return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
  if (status === "IN_PROGRESS") return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
  if (status === "RESOLVED" || status === "CLOSED") return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
  return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
}
function ticketPriorityClass(priority: string) {
  if (priority === "URGENT") return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
  if (priority === "HIGH") return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
  if (priority === "MEDIUM") return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
  return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
}

async function AgentDashboard({ user }: { user: CurrentUser }) {
  // Check if user can view tickets module
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  const userPermissions = await getUserPermissions(user.id);
  const canCreateTickets = userPermissions.has("tickets.create");
  const canViewAllTickets = userPermissions.has("tickets.view_all") || userPermissions.has("tickets.view");
  
  // Get all tickets and assigned tickets
  let allTickets: Awaited<ReturnType<typeof getTickets>> = [];
  let assignedTickets: Awaited<ReturnType<typeof getTickets>> = [];
  let ticketStats = null;
  let unresolvedAssigned: Awaited<ReturnType<typeof getTickets>> = [];
  let unresolvedUnassigned: Awaited<ReturnType<typeof getTickets>> = [];
  
  if (canViewTickets) {
    allTickets = canViewAllTickets ? await getTickets() : [];
    assignedTickets = await getTickets({ assignedToId: user.id });
    
    // Filter for unresolved tickets only (OPEN, IN_PROGRESS, PENDING)
    const unresolvedStatuses = ["OPEN", "IN_PROGRESS", "PENDING"];
    unresolvedAssigned = assignedTickets.filter((t) => unresolvedStatuses.includes(t.status));
    unresolvedUnassigned = allTickets.filter((t) => !t.assignedToId && unresolvedStatuses.includes(t.status));
    const unresolvedTotal = allTickets.filter((t) => unresolvedStatuses.includes(t.status));
    
    const openAssigned = assignedTickets.filter((t) => t.status === "OPEN").length;
    const inProgressAssigned = assignedTickets.filter((t) => t.status === "IN_PROGRESS").length;
    const pendingAssigned = assignedTickets.filter((t) => t.status === "PENDING").length;
    
    // Count only resolved/closed tickets from the last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const resolvedAssigned = assignedTickets.filter((t) => {
      if (t.status !== "RESOLVED" && t.status !== "CLOSED") return false;
      const resolvedDate = t.resolvedAt || t.closedAt;
      return resolvedDate && new Date(resolvedDate) >= oneYearAgo;
    }).length;
    
    ticketStats = {
      assigned: unresolvedAssigned.length, // Only unresolved assigned tickets
      openAssigned,
      inProgressAssigned,
      pendingAssigned,
      resolvedAssigned,
      unassigned: unresolvedUnassigned.length, // Only unresolved unassigned tickets
      total: unresolvedTotal.length, // Only unresolved total tickets
    };
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
        {/* Decorative gradient overlay */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
                Agent Dashboard
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 text-lg">
                Welcome back, <span className="font-semibold text-neutral-900 dark:text-neutral-100">{user.name || user.email.split("@")[0]}</span>! Manage and track support tickets.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-100 to-primary-50 dark:from-primary-900 dark:to-primary-950 rounded-lg border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
              <svg
                className="w-5 h-5 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">Agent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {canViewTickets && ticketStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <DashboardStatCard
            title="Assigned to Me"
            value={ticketStats.assigned}
            subtitle={`${ticketStats.openAssigned} open, ${ticketStats.inProgressAssigned} in progress${ticketStats.pendingAssigned > 0 ? `, ${ticketStats.pendingAssigned} pending` : ""}`}
            href="/dashboard/tickets?filter=assigned"
            icon={<IconTicket />}
            accent="primary"
          />
          <DashboardStatCard
            title="Unassigned"
            value={ticketStats.unassigned}
            subtitle="Unresolved tickets available for assignment"
            href="/dashboard/tickets?filter=unassigned"
            icon={<IconAlert />}
            accent="warning"
          />
          <DashboardStatCard
            title="Resolved"
            value={ticketStats.resolvedAssigned}
            subtitle="Completed tickets (last 12 months)"
            href="/dashboard/tickets?filter=resolved"
            icon={<IconCheck />}
            accent="success"
          />
          <DashboardStatCard
            title="Total Unresolved"
            value={ticketStats.total}
            subtitle="All unresolved system tickets"
            href="/dashboard/tickets"
            icon={<IconDoc />}
            accent="secondary"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-secondary-100/20 to-primary-100/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {canViewTickets && canViewAllTickets && (
              <>
                <Link
                  href="/dashboard/tickets?filter=assigned"
                  className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-primary-300 hover:bg-gradient-to-br hover:from-primary-50 dark:hover:from-primary-900 hover:to-primary-50/50 dark:hover:to-primary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary-100 dark:bg-primary-900/0 group-hover:bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors">
                      <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 dark:text-primary-300 transition-colors">My Assigned Tickets</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">View tickets assigned to you</p>
                  </div>
                </Link>
                {canViewAllTickets && (
                  <>
                    <Link
                      href="/dashboard/tickets?filter=unassigned"
                      className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-warning-300 dark:hover:border-warning-700 hover:bg-gradient-to-br hover:from-warning-50 dark:hover:from-warning-900 hover:to-warning-50/50 dark:hover:to-warning-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-warning-100 dark:bg-warning-900/0 group-hover:bg-warning-100 dark:bg-warning-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
                      <div className="relative z-10">
                        <div className="w-10 h-10 bg-warning-100 dark:bg-warning-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-warning-200 dark:group-hover:bg-warning-800 transition-colors">
                          <svg className="w-5 h-5 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-warning-700 dark:group-hover:text-warning-200 transition-colors">Unassigned Tickets</h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">Browse available tickets</p>
                      </div>
                    </Link>
                    <Link
                      href="/dashboard/tickets"
                      className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-secondary-300 dark:hover:border-secondary-700 hover:bg-gradient-to-br hover:from-secondary-50 dark:hover:from-secondary-900 hover:to-secondary-50/50 dark:hover:to-secondary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-secondary-100 dark:bg-secondary-900/0 group-hover:bg-secondary-100 dark:bg-secondary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
                      <div className="relative z-10">
                        <div className="w-10 h-10 bg-secondary-100 dark:bg-secondary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-secondary-200 dark:group-hover:bg-secondary-800 transition-colors">
                          <svg className="w-5 h-5 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-secondary-700 dark:group-hover:text-secondary-300 transition-colors">All Tickets</h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">View all system tickets</p>
                      </div>
                    </Link>
                  </>
                )}
              </>
            )}
            {canViewTickets && canCreateTickets && (
              <Link
                href="/dashboard/tickets/new"
                className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-primary-300 hover:bg-gradient-to-br hover:from-primary-50 dark:hover:from-primary-900 hover:to-primary-50/50 dark:hover:to-primary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary-100 dark:bg-primary-900/0 group-hover:bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
                <div className="relative z-10">
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors">
                    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 dark:text-primary-300 transition-colors">Create Ticket</h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Submit a new support ticket</p>
                </div>
              </Link>
            )}
            <Link
              href="/dashboard/profile"
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-primary-300 hover:bg-gradient-to-br hover:from-primary-50 dark:hover:from-primary-900 hover:to-primary-50/50 dark:hover:to-primary-900/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary-100 dark:bg-primary-900/0 group-hover:bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors">
                  <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-primary-700 dark:group-hover:text-primary-300 dark:text-primary-300 transition-colors">View Profile</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Manage your profile settings</p>
              </div>
            </Link>
            <Link
              href="/dashboard/settings"
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-gradient-to-br hover:from-neutral-50 dark:hover:from-neutral-800 hover:to-neutral-50/50 dark:hover:to-neutral-800/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-neutral-100 dark:bg-neutral-800/0 group-hover:bg-neutral-100 dark:bg-neutral-800/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center mb-3 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">Settings</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Update your preferences</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Assigned Tickets */}
      {canViewTickets && ticketStats && ticketStats.assigned > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100 dark:bg-primary-900/10 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent">My Assigned Tickets</h2>
              <Link
                href="/dashboard/tickets?filter=assigned"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium flex items-center gap-1 group"
              >
                View all <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
            <div className="space-y-3">
              {unresolvedAssigned.slice(0, 5).map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/tickets/${ticket.id}`}
                  className="block p-4 border border-neutral-200/50 dark:border-neutral-800/50 rounded-xl bg-white dark:bg-neutral-800 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gradient-to-r hover:from-primary-50/50 dark:hover:from-primary-900/50 hover:to-transparent transition-all duration-200 hover:shadow-sm group"
                >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400">
                        {ticket.ticketNumber}
                      </span>
                      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{ticket.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status === "OPEN" ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" :
                        ticket.status === "IN_PROGRESS" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" :
                        ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" :
                        "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                      }`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.priority === "URGENT" ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300" :
                        ticket.priority === "HIGH" ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300" :
                        ticket.priority === "MEDIUM" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" :
                        "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                      }`}>
                        {ticket.priority}
                      </span>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {getTicketTypeLabel(ticket.type as TicketType)}
                        </span>
                        {ticket._count.comments > 0 && (
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {ticket._count.comments} comment{ticket._count.comments !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {ticket.createdBy && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                          Created by {formatUserName(ticket.createdBy)}
                        </p>
                      )}
                  </div>
                </div>
              </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Unassigned Tickets */}
      {canViewTickets && canViewAllTickets && ticketStats && ticketStats.unassigned > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-warning-100 dark:bg-warning-900/10 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent">Unassigned Tickets</h2>
              <Link
                href="/dashboard/tickets?filter=unassigned"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium flex items-center gap-1 group"
              >
                View all <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
            <div className="space-y-3">
              {unresolvedUnassigned.slice(0, 5).map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/tickets/${ticket.id}`}
                  className="block p-4 border border-neutral-200/50 dark:border-neutral-800/50 rounded-xl bg-white dark:bg-neutral-800 hover:border-warning-300 dark:hover:border-warning-600 hover:bg-gradient-to-r hover:from-warning-50/50 dark:hover:from-warning-900/50 hover:to-transparent transition-all duration-200 hover:shadow-sm group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400">
                          {ticket.ticketNumber}
                        </span>
                        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{ticket.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          ticket.status === "OPEN" ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" :
                          ticket.status === "IN_PROGRESS" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" :
                          ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" :
                          "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                        }`}>
                          {ticket.status.replace("_", " ")}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          ticket.priority === "URGENT" ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300" :
                          ticket.priority === "HIGH" ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300" :
                          ticket.priority === "MEDIUM" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" :
                          "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                        }`}>
                          {ticket.priority}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          {getTicketTypeLabel(ticket.type as TicketType)}
                        </span>
                      </div>
                      {(ticket.createdBy || ticket.createdByName) && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                          Created by {formatUserName(ticket.createdBy, ticket.createdByName)}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // Double-check authentication (layout already does this, but good practice)
  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN")) {
    redirect(ROUTES.LOGIN);
  }

  // Render admin dashboard if user is an admin
  if (user.role === "ADMIN") {
    const { AdminDashboard } = await import("@/components/features/admin/AdminDashboard/AdminDashboard");
    return <AdminDashboard user={user} />;
  }

  // Render agent dashboard if user is an agent
  if (user.role === "AGENT") {
    return <AgentDashboard user={user} />;
  }

  // Check if user can view tickets, todos, links modules and permissions
  const [canViewTickets, canViewTodos, canViewLinks, userPermissions] = await Promise.all([
    canUserViewModule(user.id, MODULE_KEYS.TICKETS),
    canUserViewModule(user.id, MODULE_KEYS.TODOS),
    canUserViewModule(user.id, MODULE_KEYS.LINKS),
    getUserPermissions(user.id),
  ]);
  const canCreateTickets = userPermissions.has("tickets.create");
  const canViewOwnTickets = userPermissions.has("tickets.view");

  // Get ticket stats if user can view tickets
  let ticketStats = null;
  let recentTickets: Awaited<ReturnType<typeof getTickets>> = [];
  if (canViewTickets && canViewOwnTickets) {
    const tickets = await getTickets({ createdById: user.id });
    const openTickets = tickets.filter((t: typeof tickets[0]) => t.status === "OPEN").length;
    const inProgressTickets = tickets.filter((t: typeof tickets[0]) => t.status === "IN_PROGRESS").length;
    const pendingTickets = tickets.filter((t: typeof tickets[0]) => t.status === "PENDING").length;
    
    // Count only resolved/closed tickets from the last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const resolvedTickets = tickets.filter((t: typeof tickets[0]) => {
      if (t.status !== "RESOLVED" && t.status !== "CLOSED") return false;
      const resolvedDate = t.resolvedAt || t.closedAt;
      return resolvedDate && new Date(resolvedDate) >= oneYearAgo;
    }).length;
    
    // Count only unresolved tickets (OPEN, IN_PROGRESS, PENDING)
    const unresolvedTickets = openTickets + inProgressTickets + pendingTickets;
    
    // Get recent unresolved tickets for display
    recentTickets = tickets
      .filter((t: typeof tickets[0]) => 
        ["OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)
      )
      .slice(0, 5);
    
    ticketStats = {
      total: unresolvedTickets, // Changed to show only unresolved tickets
      open: openTickets,
      inProgress: inProgressTickets,
      pending: pendingTickets,
      resolved: resolvedTickets,
    };
  }

  // Todos for dashboard widget (assigned to me, unarchived, top 5)
  let dashboardTodos: DashboardTodoItem[] = [];
  if (canViewTodos) {
    try {
      const todos = await getAllTodos({ assignee: "me", archive: "unarchived" });
      dashboardTodos = todos.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        href: `/dashboard/todos/${t.id}`,
        todoNumber: t.todoNumber ?? undefined,
        dueDate: t.dueDate ?? null,
      }));
    } catch {
      dashboardTodos = [];
    }
  }

  // Recently viewed from session
  let recentlyViewed: Awaited<ReturnType<typeof getRecentlyViewed>> = [];
  try {
    recentlyViewed = await getRecentlyViewed();
  } catch {
    recentlyViewed = [];
  }

  // Favorite links for dashboard widget
  let favoriteLinks: DashboardFavoriteItem[] = [];
  if (canViewLinks) {
    try {
      const { links } = await getLinks({ isFavorite: true, limit: 5, page: 1 });
      favoriteLinks = links.map((l) => ({
        id: l.id,
        title: l.title ?? "Untitled",
        url: l.url ?? null,
        href: `/dashboard/links/${l.id}`,
      }));
    } catch {
      favoriteLinks = [];
    }
  }

  // Notifications / alerts
  const alerts: DashboardAlert[] = [];
  if (!user.emailVerified) {
    alerts.push({
      id: "email-verify",
      message: "Verify your email to get the most out of your account.",
      href: "/dashboard/profile",
      severity: "warning",
    });
  }
  if (canViewTickets && canViewOwnTickets && recentTickets.length > 0) {
    const highPriority = recentTickets.filter(
      (t: Awaited<ReturnType<typeof getTickets>>[0]) =>
        t.priority === "HIGH" || t.priority === "URGENT"
    );
    if (highPriority.length > 0) {
      alerts.push({
        id: "high-priority-tickets",
        message: `${highPriority.length} high-priority ticket(s) need attention.`,
        href: "/dashboard/tickets",
        severity: "warning",
      });
    }
  }

  const userRecentSections: RecentSection[] = [];
  if (canViewTickets && canViewOwnTickets) {
    userRecentSections.push({
      title: "My tickets",
      viewAllHref: "/dashboard/tickets",
      items: recentTickets.slice(0, 5).map((ticket: Awaited<ReturnType<typeof getTickets>>[0]) => ({
        id: ticket.id,
        title: ticket.title,
        href: `/dashboard/tickets/${ticket.id}`,
        badge: ticket.ticketNumber,
        meta: (
          <span className="flex flex-wrap gap-1.5">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ticketStatusClass(ticket.status)}`}>{ticket.status.replace("_", " ")}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ticketPriorityClass(ticket.priority)}`}>{ticket.priority}</span>
          </span>
        ),
      })),
      emptyMessage: "No open tickets. Create one to get started.",
    });
  }
  // Add "Recently viewed" section from session history
  if (recentlyViewed.length > 0) {
    userRecentSections.push({
      title: "Recently viewed",
      items: recentlyViewed.slice(0, 5).map((entry) => ({
        id: entry.id,
        title: entry.title,
        href: entry.url,
        badge: entry.type === "ticket" ? "Ticket" : entry.type === "todo" ? "Todo" : entry.type === "link" ? "Link" : "Time",
      })),
    });
  }

  if (userRecentSections.length === 0) {
    userRecentSections.push({ title: "Overview", items: [], emptyMessage: "No recent activity." });
  }

  return (
    <div className="space-y-6">
      <WelcomeHero
        name={user.name || user.email.split("@")[0]}
        role="USER"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {canViewTickets && canViewOwnTickets && ticketStats && (
          <DashboardStatCard
            title="Unresolved tickets"
            value={ticketStats.total}
            subtitle={`${ticketStats.open} open, ${ticketStats.inProgress} in progress`}
            href="/dashboard/tickets"
            icon={<IconTicket />}
            accent="primary"
          />
        )}
        <DashboardStatCard
          title="Account & email"
          value={`${user.status.charAt(0)}${user.status.slice(1).toLowerCase()}`}
          subtitle={user.emailVerified ? "Email verified" : "Email not verified yet"}
          icon={<IconMail />}
          accent={user.emailVerified ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canViewTodos && (
          <DashboardTodoWidget
            items={dashboardTodos}
            viewAllHref="/dashboard/todos"
            emptyMessage="No tasks right now. Add one from ToDo."
          />
        )}
        {canViewLinks && (
          <DashboardPinnedFavorites
            items={favoriteLinks}
            viewAllHref="/dashboard/links"
            emptyMessage="No favorites yet. Star links from My Links."
          />
        )}
        {alerts.length > 0 && (
          <DashboardNotificationsAlerts alerts={alerts} />
        )}
      </div>

      <RecentActivityPanel
        sections={userRecentSections}
        title="Continue where you left off"
      />
    </div>
  );
}
