import { getCurrentUser } from "@/lib/utils/auth-server";
import { hasPermission, hasTicketPermission } from "@/lib/utils/permissions";
import { formatUserName } from "@/lib/utils/users";
import { getTicketTypePrefix } from "@/lib/utils/tickets";
import { formatDateTime } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule, isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTicket } from "@/server/actions/tickets";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketCommentsAndActivity } from "@/components/features/tickets/TicketCommentsAndActivity";
import { TicketAssignmentFields } from "@/components/features/tickets/TicketAssignmentFields";
import { TicketStatusPriorityFields } from "@/components/features/tickets/TicketStatusPriorityFields";
import { TicketTimerSection } from "@/components/features/tickets/TicketTimerSection";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { notFound } from "next/navigation";
import { getAgents } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import { getTimeEntriesForTicket, getAvailableTimeEntriesForAssignment } from "@/server/actions/time-tracking";
import { getUserProjectsForAssignment, getProject } from "@/server/actions/projects";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

// Force dynamic rendering to prevent caching issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view tickets module (module enabled AND user has permission)
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);

  if (!canViewTickets) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Tickets module. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // getTicket already checks for dynamic permissions and general permissions
  // It returns null if the user doesn't have access
  const ticket = await getTicket(id);

  if (!ticket) {
    // Show permission denied page instead of 404
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <svg
              className="w-16 h-16 text-error-500 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Access Denied
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            You don&apos;t have permission to view this ticket. The permission may have been removed or you may not have been granted access to this specific ticket.
          </p>
          <Link href="/dashboard/tickets">
            <Button variant="primary">Back to Tickets</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Get agents and groups for editable assignment fields (only for agents/admins/moderators)
  const isAgent = user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR";
  const agents = isAgent ? await getAgents() : [];
  const groups = isAgent ? await getGroups() : [];
  const projects = isAgent ? await getUserProjectsForAssignment() : [];

  // Check if time tracking module is enabled and user has permission to view ticket time entries
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
  const ticketPrefix = getTicketTypePrefix(ticket.type as any);
  const hasDynamicTimeEntriesView = await hasTicketPermission(user.id, ticket.id, ticketPrefix, "time_entries.view");
  const hasDynamicTimeEntriesCreate = await hasTicketPermission(user.id, ticket.id, ticketPrefix, "time_entries.create");
  
  const canViewTimeEntries = timeTrackingEnabled && (
    user.role === "ADMIN" || 
    hasDynamicTimeEntriesView ||
    await hasPermission(user.id, "tickets.time_entries.view") ||
    await hasPermission(user.id, "time_tracking.view") ||
    await hasPermission(user.id, "time_tracking.view_all")
  );
  const canCreateTimeEntries = timeTrackingEnabled && (
    user.role === "ADMIN" ||
    hasDynamicTimeEntriesCreate ||
    await hasPermission(user.id, "tickets.time_entries.create") ||
    await hasPermission(user.id, "time_tracking.create")
  );
  const timeEntries = canViewTimeEntries ? await getTimeEntriesForTicket(ticket.id) : [];
  const availableTimeEntries = canViewTimeEntries ? await getAvailableTimeEntriesForAssignment() : [];
  
  // Filter stopped timers for the Timers tab
  const stoppedTimeEntries = timeTrackingEnabled 
    ? timeEntries.filter((entry) => entry.status === "STOPPED")
    : [];
  
  // Only show running and paused timers in sidebar (active timers that can be controlled)
  const activeTimeEntries = timeTrackingEnabled
    ? timeEntries.filter((entry) => entry.status === "RUNNING" || entry.status === "PAUSED")
    : [];


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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href="/dashboard/tickets">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
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
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{ticket.title}</h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              Created {formatDateTime(ticket.createdAt)}
            </p>
          </div>
        </div>
        {/* Edit Button for Agents, Admins, and Moderators */}
        {(user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR") && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/tickets/${ticket.id}/edit`}>
              <Button variant="primary" size="sm" className="w-full sm:w-auto">
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
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Description */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
            <RichTextDisplay
              content={(ticket as any).descriptionHtml || ticket.description || ""}
            />
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
                  projectId={ticket.projectId}
                  agents={agents}
                  groups={groups}
                  projects={projects}
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

              {/* Project - Only show if project is assigned */}
              {ticket.project && (
                <>
                  {/* Divider */}
                  <div className="border-t border-neutral-200 pt-4"></div>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Project
                    </label>
                    <Link
                      href={`/dashboard/projects/${ticket.project.id}`}
                      className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {ticket.project.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ticket.project.color }}
                        />
                      )}
                      <span className="font-medium">{ticket.project.name}</span>
                      <span className="text-neutral-500 dark:text-neutral-500 font-mono text-xs">
                        ({ticket.project.code})
                      </span>
                    </Link>
                  </div>
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
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(ticket.createdAt)}</p>
                </div>
                {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Last Updated
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(ticket.updatedAt)}</p>
                  </div>
                )}
                {ticket.resolvedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Resolved
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : "—"}</p>
                  </div>
                )}
                {ticket.closedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Closed
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{ticket.closedAt ? formatDateTime(ticket.closedAt) : "—"}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Time Tracking Section - Only visible if user has permission */}
          {canViewTimeEntries && (
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
                userTimezone={user.timezone ?? "UTC"}
                canCreate={canCreateTimeEntries}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
