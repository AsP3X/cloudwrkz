import { getCurrentUser } from "@/lib/utils/auth-server";
import { formatUserName } from "@/lib/utils/users";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTicket } from "@/server/actions/tickets";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketCommentsAndActivity } from "@/components/features/tickets/TicketCommentsAndActivity";
import { TicketAssignmentFields } from "@/components/features/tickets/TicketAssignmentFields";
import { TicketStatusPriorityFields } from "@/components/features/tickets/TicketStatusPriorityFields";
import { TicketTimerSection } from "@/components/features/tickets/TicketTimerSection";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { notFound } from "next/navigation";
import { getAgents } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import { getTimeEntriesForTicket, getAvailableTimeEntriesForAssignment } from "@/server/actions/time-tracking";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);

  if (!ticketsEnabled) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          The tickets module is not currently enabled. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const ticket = await getTicket(id);

  if (!ticket) {
    notFound();
  }

  // Check if user has permission to view this ticket
  // Creator, assigned agent, admin, or moderator can view
  const canView = 
    ticket.createdById === user.id ||
    user.role === "ADMIN" ||
    user.role === "MODERATOR" ||
    (user.role === "AGENT" && ticket.assignedToId === user.id) ||
    user.role === "AGENT"; // Agents can view all tickets
  
  if (!canView) {
    redirect(ROUTES.DASHBOARD);
  }

  // Get agents and groups for editable assignment fields (only for agents/admins/moderators)
  const isAgent = user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR";
  const agents = isAgent ? await getAgents() : [];
  const groups = isAgent ? await getGroups() : [];

  // Check if time tracking module is enabled and get timers
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
  const timeEntries = timeTrackingEnabled ? await getTimeEntriesForTicket(ticket.id) : [];
  const availableTimeEntries = timeTrackingEnabled ? await getAvailableTimeEntriesForAssignment() : [];
  
  // Filter stopped timers for the Timers tab
  const stoppedTimeEntries = timeTrackingEnabled 
    ? timeEntries.filter((entry) => entry.status === "STOPPED")
    : [];
  
  // Only show running and paused timers in sidebar (active timers that can be controlled)
  const activeTimeEntries = timeTrackingEnabled
    ? timeEntries.filter((entry) => entry.status === "RUNNING" || entry.status === "PAUSED")
    : [];

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "IN_PROGRESS":
        return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
      case "RESOLVED":
      case "CLOSED":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "PENDING":
        return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
      case "CANCELLED":
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
      default:
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
      case "HIGH":
        return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
      case "MEDIUM":
        return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
      case "LOW":
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
      default:
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AGENT":
        return {
          label: "Agent",
          className: "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800",
        };
      case "ADMIN":
        return {
          label: "Admin",
          className: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
        };
      case "MODERATOR":
        return {
          label: "Moderator",
          className: "bg-secondary-100 dark:bg-secondary-900 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-800",
        };
      default:
        return null;
    }
  };

  /**
   * Formats the display name for a deleted user, showing the full UUID if available
   * Extracts UUID from "Deleted User (UUID)" format and displays it fully
   * If createdById is still available, uses that full UUID instead
   */
  const formatDeletedUserName = (
    user: typeof ticket.createdBy, 
    storedName: string | null | undefined,
    createdById: string | null | undefined
  ): string => {
    // If user exists, use standard formatting
    if (user) {
      return formatUserName(user, storedName);
    }
    
    // If createdById is still available (user was deleted but ID wasn't nulled), use the full UUID
    if (createdById) {
      return `Deleted User (${createdById})`;
    }
    
    // If no stored name, return fallback
    if (!storedName) {
      return "Unknown User";
    }
    
    // Check if stored name matches "Deleted User (ID)" pattern
    const deletedUserMatch = storedName.match(/^Deleted User \((.+)\)$/);
    if (deletedUserMatch) {
      const userId = deletedUserMatch[1];
      // Return with full UUID displayed (or prefix if that's what was stored)
      return `Deleted User (${userId})`;
    }
    
    // If it doesn't match the pattern, return as-is
    return storedName;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/tickets">
            <Button variant="outline" size="sm">
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Tickets
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{ticket.title}</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Created {formatDate(ticket.createdAt)}
            </p>
          </div>
        </div>
        {/* Edit Button for Agents, Admins, and Moderators */}
        {(user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") && (
          <Link href={`/dashboard/tickets/${ticket.id}/edit`}>
            <Button variant="primary" size="sm">
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit Ticket
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Description */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
            {ticket.description ? (
              <div className="prose prose-sm max-w-none text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap">
                {ticket.description}
              </div>
            ) : (
              <p className="text-neutral-500 dark:text-neutral-500 italic">No description provided.</p>
            )}
          </div>

          {/* Comments and Activity Section */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <TicketCommentsAndActivity
              ticket={ticket}
              userRole={user.role}
              stoppedTimeEntries={stoppedTimeEntries.map((entry) => ({
                id: entry.id,
                name: entry.name,
                description: entry.description,
                status: entry.status,
                startedAt: entry.startedAt,
                totalDuration: entry.totalDuration,
                lastResumedAt: entry.lastResumedAt,
                createdAt: entry.createdAt,
              }))}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Info Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">Ticket Information</h3>
            <div className="space-y-4">
              {/* Ticket Number */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Ticket ID
                </label>
                <p className="text-sm font-mono font-semibold text-primary-600">
                  {ticket.ticketNumber}
                </p>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </label>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 dark:text-neutral-300 dark:text-neutral-700">
                  {getTicketTypeLabel(ticket.type as TicketType)}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Status and Priority - Editable for agents */}
              {isAgent ? (
                <TicketStatusPriorityFields
                  ticketId={ticket.id}
                  status={ticket.status}
                  priority={ticket.priority}
                />
              ) : (
                <>
                  {/* Status */}
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Status
                    </label>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        ticket.status
                      )}`}
                    >
                      {ticket.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Priority
                    </label>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(
                        ticket.priority
                      )}`}
                    >
                      {ticket.priority}
                    </span>
                  </div>
                </>
              )}

              {/* Divider */}
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Created By */}
              <div>
                <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created By
                </label>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatDeletedUserName(ticket.createdBy, ticket.createdByName, ticket.createdById)}
                </p>
              </div>

              {/* Assigned To and Assigned To Group - Editable for agents */}
              {isAgent ? (
                <TicketAssignmentFields
                  ticketId={ticket.id}
                  assignedToId={ticket.assignedToId}
                  assignedToGroupId={ticket.assignedToGroupId}
                  agents={agents}
                  groups={groups}
                />
              ) : (
                <>
                  {/* Assigned To */}
                  {ticket.assignedTo ? (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">
                        {formatUserName(ticket.assignedTo)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To
                      </label>
                      <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">Unassigned</p>
                    </div>
                  )}

                  {/* Assigned To Group */}
                  {ticket.assignedToGroup ? (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To Group
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">
                        {ticket.assignedToGroup.name}
                      </p>
                      {ticket.assignedToGroup.description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          {ticket.assignedToGroup.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To Group
                      </label>
                      <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">No group assignment</p>
                    </div>
                  )}
                </>
              )}

              {/* Divider */}
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Dates */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Created
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDate(ticket.createdAt)}</p>
                </div>
                {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Last Updated
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDate(ticket.updatedAt)}</p>
                  </div>
                )}
                {ticket.resolvedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Resolved
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDate(ticket.resolvedAt)}</p>
                  </div>
                )}
                {ticket.closedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Closed
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDate(ticket.closedAt)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Time Tracking Section */}
          {timeTrackingEnabled && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
              <TicketTimerSection
                ticketId={ticket.id}
                ticketNumber={ticket.ticketNumber}
                ticketTitle={ticket.title}
                initialTimeEntries={activeTimeEntries.map((entry) => ({
                  id: entry.id,
                  name: entry.name,
                  description: entry.description,
                  status: entry.status,
                  startedAt: entry.startedAt,
                  totalDuration: entry.totalDuration,
                  lastResumedAt: entry.lastResumedAt,
                  createdAt: entry.createdAt,
                }))}
                initialAvailableEntries={availableTimeEntries.map((entry) => ({
                  id: entry.id,
                  name: entry.name,
                  status: entry.status,
                  createdAt: entry.createdAt,
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
