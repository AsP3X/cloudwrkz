import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTicket } from "@/server/actions/tickets";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketCommentForm } from "@/components/features/tickets/TicketCommentForm";
import { TicketAssignmentFields } from "@/components/features/tickets/TicketAssignmentFields";
import { TicketStatusPriorityFields } from "@/components/features/tickets/TicketStatusPriorityFields";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { notFound } from "next/navigation";
import { getAgents } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";

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
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600 mb-4">
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
        return "bg-blue-100 text-blue-700";
      case "IN_PROGRESS":
        return "bg-yellow-100 text-yellow-700";
      case "RESOLVED":
      case "CLOSED":
        return "bg-green-100 text-green-700";
      case "PENDING":
        return "bg-orange-100 text-orange-700";
      case "CANCELLED":
        return "bg-neutral-100 text-neutral-700";
      default:
        return "bg-neutral-100 text-neutral-700";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "bg-red-100 text-red-700";
      case "HIGH":
        return "bg-orange-100 text-orange-700";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-700";
      case "LOW":
        return "bg-neutral-100 text-neutral-700";
      default:
        return "bg-neutral-100 text-neutral-700";
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "AGENT":
        return {
          label: "Agent",
          className: "bg-primary-100 text-primary-700 border-primary-200",
        };
      case "ADMIN":
        return {
          label: "Admin",
          className: "bg-error-100 text-error-700 border-error-200",
        };
      case "MODERATOR":
        return {
          label: "Moderator",
          className: "bg-secondary-100 text-secondary-700 border-secondary-200",
        };
      default:
        return null;
    }
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
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">{ticket.title}</h1>
            <p className="text-neutral-600">
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
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">Description</h2>
            {ticket.description ? (
              <div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-wrap">
                {ticket.description}
              </div>
            ) : (
              <p className="text-neutral-500 italic">No description provided.</p>
            )}
          </div>

          {/* Comments Section */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 mb-6">
              Comments ({ticket.comments.length})
            </h2>

            {/* Comments List */}
            {ticket.comments.length === 0 ? (
              <div className="text-center py-8">
                <svg
                  className="w-12 h-12 text-neutral-300 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-neutral-600 mb-6">No comments yet. Be the first to comment!</p>
              </div>
            ) : (
              <div className="space-y-6 mb-8">
                {ticket.comments.map((comment: typeof ticket.comments[0]) => (
                  <div
                    key={comment.id}
                    className={`border-l-4 pl-4 py-2 rounded-r-lg ${
                      comment.isAgentOnly
                        ? "border-orange-300 bg-orange-50"
                        : "border-primary-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          comment.isAgentOnly ? "bg-orange-100" : "bg-primary-100"
                        }`}>
                          <span className={`text-sm font-semibold ${
                            comment.isAgentOnly ? "text-orange-700" : "text-primary-700"
                          }`}>
                            {(comment.user.name || comment.user.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-neutral-900">
                              {comment.user.name || comment.user.email}
                            </p>
                            {comment.isAgentOnly && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                                Agent Only
                              </span>
                            )}
                            {comment.user.role && getRoleBadge(comment.user.role) && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadge(comment.user.role)?.className}`}
                              >
                                {getRoleBadge(comment.user.role)?.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500">
                            {formatDate(comment.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-neutral-700 whitespace-pre-wrap mt-2">
                      {comment.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Comment Form */}
            <div className="border-t border-neutral-200 pt-6">
              <TicketCommentForm ticketId={ticket.id} userRole={user.role} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Info Card */}
          <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-4">Ticket Information</h3>
            <div className="space-y-4">
              {/* Ticket Number */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                  Ticket ID
                </label>
                <p className="text-sm font-mono font-semibold text-primary-600">
                  {ticket.ticketNumber}
                </p>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </label>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700">
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
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
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
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
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
                <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created By
                </label>
                <p className="text-sm text-neutral-900">
                  {ticket.createdBy.name || ticket.createdBy.email}
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
                      <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To
                      </label>
                      <p className="text-sm text-neutral-900">
                        {ticket.assignedTo.name || ticket.assignedTo.email}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To
                      </label>
                      <p className="text-sm text-neutral-500 italic">Unassigned</p>
                    </div>
                  )}

                  {/* Assigned To Group */}
                  {ticket.assignedToGroup ? (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To Group
                      </label>
                      <p className="text-sm text-neutral-900">
                        {ticket.assignedToGroup.name}
                      </p>
                      {ticket.assignedToGroup.description && (
                        <p className="text-xs text-neutral-500 mt-1">
                          {ticket.assignedToGroup.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                        Assigned To Group
                      </label>
                      <p className="text-sm text-neutral-500 italic">No group assignment</p>
                    </div>
                  )}
                </>
              )}

              {/* Divider */}
              <div className="border-t border-neutral-200 pt-4"></div>

              {/* Dates */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                    Created
                  </label>
                  <p className="text-sm text-neutral-900">{formatDate(ticket.createdAt)}</p>
                </div>
                {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                      Last Updated
                    </label>
                    <p className="text-sm text-neutral-900">{formatDate(ticket.updatedAt)}</p>
                  </div>
                )}
                {ticket.resolvedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                      Resolved
                    </label>
                    <p className="text-sm text-neutral-900">{formatDate(ticket.resolvedAt)}</p>
                  </div>
                )}
                {ticket.closedAt && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
                      Closed
                    </label>
                    <p className="text-sm text-neutral-900">{formatDate(ticket.closedAt)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
