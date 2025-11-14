import { getCurrentUser } from "@/lib/utils/auth-server";
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
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">
              Agent Dashboard
            </h1>
            <p className="text-neutral-600">
              Welcome back, {user.name || user.email.split("@")[0]}! Manage and track support tickets.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-primary-100 rounded-lg">
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
            <span className="text-sm font-semibold text-primary-700">Agent</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {ticketsEnabled && ticketStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Assigned Tickets */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Assigned to Me</p>
                <p className="text-3xl font-bold text-neutral-900 mt-2">{ticketStats.assigned}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {ticketStats.openAssigned} open, {ticketStats.inProgressAssigned} in progress{ticketStats.pendingAssigned > 0 ? `, ${ticketStats.pendingAssigned} pending` : ""}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
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

          {/* Unassigned Tickets */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Unassigned</p>
                <p className="text-3xl font-bold text-neutral-900 mt-2">{ticketStats.unassigned}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Unresolved tickets available for assignment
                </p>
              </div>
              <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center">
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

          {/* Resolved Tickets */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Resolved</p>
                <p className="text-3xl font-bold text-neutral-900 mt-2">{ticketStats.resolvedAssigned}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Completed tickets
                </p>
              </div>
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
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

          {/* Total Tickets */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Total Unresolved</p>
                <p className="text-3xl font-bold text-neutral-900 mt-2">{ticketStats.total}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  All unresolved system tickets
                </p>
              </div>
              <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center">
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
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ticketsEnabled && (
            <>
              <Link
                href="/dashboard/tickets?filter=assigned"
                className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
              >
                <h3 className="font-semibold text-neutral-900 mb-1">My Assigned Tickets</h3>
                <p className="text-sm text-neutral-600">View tickets assigned to you</p>
              </Link>
              <Link
                href="/dashboard/tickets?filter=unassigned"
                className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
              >
                <h3 className="font-semibold text-neutral-900 mb-1">Unassigned Tickets</h3>
                <p className="text-sm text-neutral-600">Browse available tickets</p>
              </Link>
              <Link
                href="/dashboard/tickets"
                className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
              >
                <h3 className="font-semibold text-neutral-900 mb-1">All Tickets</h3>
                <p className="text-sm text-neutral-600">View all system tickets</p>
              </Link>
            </>
          )}
          <Link
            href="/dashboard/profile"
            className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
          >
            <h3 className="font-semibold text-neutral-900 mb-1">View Profile</h3>
            <p className="text-sm text-neutral-600">Manage your profile settings</p>
          </Link>
          <Link
            href="/dashboard/settings"
            className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
          >
            <h3 className="font-semibold text-neutral-900 mb-1">Settings</h3>
            <p className="text-sm text-neutral-600">Update your preferences</p>
          </Link>
        </div>
      </div>

      {/* Assigned Tickets */}
      {ticketsEnabled && ticketStats && ticketStats.assigned > 0 && (
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900">My Assigned Tickets</h2>
            <Link
              href="/dashboard/tickets?filter=assigned"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {unresolvedAssigned.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/tickets/${ticket.id}`}
                className="block p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-primary-600">
                        {ticket.ticketNumber}
                      </span>
                      <h3 className="font-semibold text-neutral-900">{ticket.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-600">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status === "OPEN" ? "bg-blue-100 text-blue-700" :
                        ticket.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                        ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "bg-green-100 text-green-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.priority === "URGENT" ? "bg-red-100 text-red-700" :
                        ticket.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                        ticket.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700">
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </span>
                      {ticket._count.comments > 0 && (
                        <span className="text-neutral-500">
                          {ticket._count.comments} comment{ticket._count.comments !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {ticket.createdBy && (
                      <p className="text-xs text-neutral-500 mt-2">
                        Created by {ticket.createdBy.name || ticket.createdBy.email}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned Tickets */}
      {ticketsEnabled && ticketStats && ticketStats.unassigned > 0 && (
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900">Unassigned Tickets</h2>
            <Link
              href="/dashboard/tickets?filter=unassigned"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {unresolvedUnassigned.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href={`/dashboard/tickets/${ticket.id}`}
                className="block p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-primary-600">
                        {ticket.ticketNumber}
                      </span>
                      <h3 className="font-semibold text-neutral-900">{ticket.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-600">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status === "OPEN" ? "bg-blue-100 text-blue-700" :
                        ticket.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                        ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "bg-green-100 text-green-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.priority === "URGENT" ? "bg-red-100 text-red-700" :
                        ticket.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                        ticket.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700">
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </span>
                    </div>
                    {ticket.createdBy && (
                      <p className="text-xs text-neutral-500 mt-2">
                        Created by {ticket.createdBy.name || ticket.createdBy.email}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
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
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          Welcome back, {user.name || user.email.split("@")[0]}!
        </h1>
        <p className="text-neutral-600">
          Here&apos;s what&apos;s happening with your account today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Tickets Stat Card - Only show if module is enabled */}
        {ticketsEnabled && ticketStats && (
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Unresolved Tickets</p>
                <p className="text-3xl font-bold text-neutral-900 mt-2">{ticketStats.total}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {ticketStats.open} open, {ticketStats.inProgress} in progress{ticketStats.pending > 0 ? `, ${ticketStats.pending} pending` : ""}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
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
        )}

        {/* Stat Card 2 */}
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Account Status</p>
              <p className="text-lg font-semibold text-neutral-900 mt-2 capitalize">
                {user.status.toLowerCase()}
              </p>
            </div>
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
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

        {/* Stat Card 3 */}
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Email Verified</p>
              <p className="text-lg font-semibold text-neutral-900 mt-2">
                {user.emailVerified ? "Verified" : "Pending"}
              </p>
            </div>
            <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center">
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

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-neutral-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ticketsEnabled && (
            <Link
              href="/dashboard/tickets/new"
              className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
            >
              <h3 className="font-semibold text-neutral-900 mb-1">Create Ticket</h3>
              <p className="text-sm text-neutral-600">Submit a new support ticket</p>
            </Link>
          )}
          <Link
            href="/dashboard/profile"
            className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
          >
            <h3 className="font-semibold text-neutral-900 mb-1">View Profile</h3>
            <p className="text-sm text-neutral-600">Manage your profile settings</p>
          </Link>
          <Link
            href="/dashboard/settings"
            className="p-4 border-2 border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200 text-left"
          >
            <h3 className="font-semibold text-neutral-900 mb-1">Settings</h3>
            <p className="text-sm text-neutral-600">Update your preferences</p>
          </Link>
        </div>
      </div>

      {/* Recent Tickets - Only show if module is enabled */}
      {ticketsEnabled && ticketStats && ticketStats.total > 0 && (
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900">Recent Unresolved Tickets</h2>
            <Link
              href="/dashboard/tickets"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {(await getTickets({ createdById: user.id }))
              .filter((t: Awaited<ReturnType<typeof getTickets>>[0]) => 
                ["OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)
              )
              .slice(0, 5)
              .map((ticket: Awaited<ReturnType<typeof getTickets>>[0]) => (
              <Link
                key={ticket.id}
                href={`/dashboard/tickets/${ticket.id}`}
                className="block p-4 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold text-primary-600">
                        {ticket.ticketNumber}
                      </span>
                      <h3 className="font-semibold text-neutral-900">{ticket.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-600">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status === "OPEN" ? "bg-blue-100 text-blue-700" :
                        ticket.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-700" :
                        ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "bg-green-100 text-green-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.priority === "URGENT" ? "bg-red-100 text-red-700" :
                        ticket.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                        ticket.priority === "MEDIUM" ? "bg-yellow-100 text-yellow-700" :
                        "bg-neutral-100 text-neutral-700"
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700">
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </span>
                      {ticket._count.comments > 0 && (
                        <span className="text-neutral-500">
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
      )}
    </div>
  );
}
