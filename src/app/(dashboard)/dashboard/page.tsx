import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import Link from "next/link";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import type { CurrentUser } from "@/lib/utils/auth-server";

async function AgentDashboard({ user }: { user: CurrentUser }) {
  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  
  // Get all tickets and assigned tickets
  let allTickets: Awaited<ReturnType<typeof getTickets>> = [];
  let assignedTickets: Awaited<ReturnType<typeof getTickets>> = [];
  let ticketStats = null;
  let unresolvedAssigned: Awaited<ReturnType<typeof getTickets>> = [];
  let unresolvedUnassigned: Awaited<ReturnType<typeof getTickets>> = [];
  
  if (ticketsEnabled) {
    allTickets = await getTickets();
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
      {ticketsEnabled && ticketStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Assigned Tickets */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/30 transition-colors" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Assigned to Me</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent mt-2">{ticketStats.assigned}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    {ticketStats.openAssigned} open, {ticketStats.inProgressAssigned} in progress{ticketStats.pendingAssigned > 0 ? `, ${ticketStats.pendingAssigned} pending` : ""}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900 dark:to-primary-950 rounded-lg flex items-center justify-center border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Unassigned Tickets */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-warning-100 dark:bg-warning-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-warning-200 dark:group-hover:bg-warning-800/30 transition-colors" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Unassigned</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-warning-600 to-warning-700 bg-clip-text text-transparent mt-2">{ticketStats.unassigned}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    Unresolved tickets available for assignment
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-warning-100 to-warning-50 dark:from-warning-900 dark:to-warning-950 rounded-lg flex items-center justify-center border border-warning-200/50 dark:border-warning-800/50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-warning-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Resolved Tickets */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-success-100/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-success-200/30 transition-colors" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Resolved</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-success-600 to-success-700 bg-clip-text text-transparent mt-2">{ticketStats.resolvedAssigned}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    Completed tickets
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-success-100 to-success-50 dark:from-success-900 dark:to-success-950 rounded-lg flex items-center justify-center border border-success-200/50 dark:border-success-800/50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-success-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Total Tickets */}
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-100 dark:bg-secondary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-secondary-200 dark:group-hover:bg-secondary-800/30 transition-colors" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Unresolved</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-secondary-600 to-secondary-700 bg-clip-text text-transparent mt-2">{ticketStats.total}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    All unresolved system tickets
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-secondary-100 to-secondary-50 dark:from-secondary-900 dark:to-secondary-950 rounded-lg flex items-center justify-center border border-secondary-200/50 dark:border-secondary-800/50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-secondary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-secondary-100/20 to-primary-100/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ticketsEnabled && (
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
                <Link
                  href="/dashboard/tickets?filter=unassigned"
                  className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-warning-300 hover:bg-gradient-to-br hover:from-warning-50 hover:to-warning-50/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-warning-100 dark:bg-warning-900/0 group-hover:bg-warning-100 dark:bg-warning-900/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 bg-warning-100 dark:bg-warning-900 rounded-lg flex items-center justify-center mb-3 group-hover:bg-warning-200 dark:group-hover:bg-warning-800 transition-colors">
                      <svg className="w-5 h-5 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-warning-700 dark:group-hover:text-warning-300 transition-colors">Unassigned Tickets</h3>
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
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-gradient-to-br hover:from-neutral-50 hover:to-neutral-50/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-neutral-100 dark:bg-neutral-800/0 group-hover:bg-neutral-100 dark:bg-neutral-800/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center mb-3 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">Settings</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Update your preferences</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Assigned Tickets */}
      {ticketsEnabled && ticketStats && ticketStats.assigned > 0 && (
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
      {ticketsEnabled && ticketStats && ticketStats.unassigned > 0 && (
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
  if (!user || (user.role !== "USER" && user.role !== "AGENT")) {
    redirect(ROUTES.LOGIN);
  }

  // Render agent dashboard if user is an agent
  if (user.role === "AGENT") {
    return <AgentDashboard user={user} />;
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  
  // Get ticket stats if module is enabled
  let ticketStats = null;
  let recentTickets: Awaited<ReturnType<typeof getTickets>> = [];
  if (ticketsEnabled) {
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

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
        {/* Decorative gradient overlay */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/30 to-secondary-100/30 dark:from-primary-900/30 dark:to-secondary-900/30 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent mb-2">
            Welcome back, {user.name || user.email.split("@")[0]}!
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg">
            Here&apos;s what&apos;s happening with your account today.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Tickets Stat Card - Only show if module is enabled */}
        {ticketsEnabled && ticketStats && (
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/30 transition-colors" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Unresolved Tickets</p>
                  <p className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent mt-2">{ticketStats.total}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    {ticketStats.open} open, {ticketStats.inProgress} in progress{ticketStats.pending > 0 ? `, ${ticketStats.pending} pending` : ""}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900 dark:to-primary-950 rounded-lg flex items-center justify-center border border-primary-200/50 dark:border-primary-800/50 shadow-sm">
                  <svg
                    className="w-6 h-6 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stat Card 2 */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-success-100/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-success-200/30 transition-colors" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Account Status</p>
                <p className="text-lg font-semibold bg-gradient-to-r from-success-600 to-success-700 bg-clip-text text-transparent mt-2 capitalize">
                  {user.status.toLowerCase()}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-success-100 to-success-50 dark:from-success-900 dark:to-success-950 rounded-lg flex items-center justify-center border border-success-200/50 dark:border-success-800/50 shadow-sm">
                <svg
                  className="w-6 h-6 text-success-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Stat Card 3 */}
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200 hover:scale-[1.02] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-100 dark:bg-secondary-900/20 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-secondary-200 dark:group-hover:bg-secondary-800/30 transition-colors" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Email Verified</p>
                <p className="text-lg font-semibold bg-gradient-to-r from-secondary-600 to-secondary-700 bg-clip-text text-transparent mt-2">
                  {user.emailVerified ? "Verified" : "Pending"}
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-secondary-100 to-secondary-50 dark:from-secondary-900 dark:to-secondary-950 rounded-lg flex items-center justify-center border border-secondary-200/50 dark:border-secondary-800/50 shadow-sm">
                <svg
                  className="w-6 h-6 text-secondary-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-secondary-100/20 to-primary-100/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ticketsEnabled && (
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
              className="group p-5 border-2 border-neutral-200/50 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-gradient-to-br hover:from-neutral-50 hover:to-neutral-50/50 transition-all duration-200 text-left hover:shadow-md relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-neutral-100 dark:bg-neutral-800/0 group-hover:bg-neutral-100 dark:bg-neutral-800/20 rounded-full blur-2xl -mr-12 -mt-12 transition-all" />
              <div className="relative z-10">
                <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center mb-3 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors">
                  <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">Settings</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">Update your preferences</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Tickets - Only show if module is enabled */}
      {ticketsEnabled && ticketStats && ticketStats.total > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-100 dark:bg-primary-900/10 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-neutral-100 dark:to-neutral-300 bg-clip-text text-transparent">Recent Unresolved Tickets</h2>
              <Link
                href="/dashboard/tickets"
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 dark:text-primary-300 font-medium flex items-center gap-1 group"
              >
                View all <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
            <div className="space-y-3">
              {recentTickets.map((ticket: Awaited<ReturnType<typeof getTickets>>[0]) => (
                <Link
                  key={ticket.id}
                  href={`/dashboard/tickets/${ticket.id}`}
                  className="block p-4 border border-neutral-200/50 dark:border-neutral-800/50 rounded-xl hover:border-primary-300 hover:bg-gradient-to-r hover:from-primary-50/50 dark:hover:from-primary-900/50 hover:to-transparent transition-all duration-200 hover:shadow-sm group"
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
