import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Ticket, TicketActivity, TicketComment, Todo, UserSummary } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { TicketDetailHeaderActions } from "@/components/features/tickets/TicketDetailHeaderActions";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { TicketCommentsAndActivity } from "@/components/features/tickets/TicketCommentsAndActivity/TicketCommentsAndActivity";
import { TicketTimerSection } from "@/components/features/tickets/TicketTimerSection";
import { TasksSection } from "@/components/features/tasks/TasksSection/TasksSection";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import type { TimeEntry } from "@/lib/types";
import { canDeleteOthersTickets, hasAgentCapabilities, PERM } from "@/lib/permissions";

// Human: Support ticket command center showing metadata, threaded activity, linked todos, and time tracking hooks.
// Agent: GET /tickets/:id + related collections; LOCAL format helpers; RENDERS TicketCommentsAndActivity; RBAC gates.

// Human: Normalizes nullable ISO timestamps into a locale-aware date/time string for ticket metadata rows.
// Agent: READS iso string|null; try/catch new Date; RETURNS locale medium+short OR raw fallback; PURE.

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// Human: Friendly display string for ticket actors when only summary objects (name/email) are available.
// Agent: READS UserSummary|null; RETURNS name trim OR email OR em dash; PURE string helper.

function formatUserName(u: UserSummary | null | undefined): string {
  if (!u) return "—";
  return u.name?.trim() ? u.name : u.email;
}

// Human: Tailwind class bundle for each ticket lifecycle status used in badges across the detail header.
// Agent: SWITCH ticket status OPEN|IN_PROGRESS|PENDING|RESOLVED|CLOSED|CANCELLED|default; RETURNS bg/text classes.

function getStatusColor(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
    case "IN_PROGRESS":
      return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300";
    case "RESOLVED":
    case "CLOSED":
      return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
    case "PENDING":
      return "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300";
    case "CANCELLED":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
}

// Human: Tailwind class bundle for ticket priority chips so severity reads consistently beside status badges.
// Agent: SWITCH priority URGENT|HIGH|MEDIUM|LOW|default; RETURNS bg/text class string; PURE.

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";
    case "HIGH":
      return "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300";
    case "MEDIUM":
      return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300";
    case "LOW":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
}

// Human: Ticket detail route wiring fetches, permission checks, and composed sections for comments and worklogs.
// Agent: STATE ticket,activities,comments; useParams id; FETCH /tickets/:id; RENDERS TasksSection+TicketTimerSection.

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [ticketTodos, setTicketTodos] = useState<Todo[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const canViewTickets = can("modules.tickets.view");
  const canViewTimeTracking = can(PERM.MODULES_TIMETRACKING_VIEW);
  const isAgent = hasAgentCapabilities(can);
  // Human: Deleting another user's ticket needs delete + view-all (or admin tickets); own tickets need tickets.delete.
  // Agent: canDeleteOthersTickets(can) OR (PERM.TICKETS_DELETE + created_by matches session user id).
  const canDeleteTicket =
    canDeleteOthersTickets(can) ||
    (can(PERM.TICKETS_DELETE) && ticket?.created_by?.id === user?.id);

  useEffect(() => {
    if (!id || id === "undefined") {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ ticket: Ticket }>(`/tickets/${id}`)
      .then((data) => {
        if (!cancelled) setTicket(data.ticket);
      })
      .catch(() => {
        if (!cancelled) {
          setTicket(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !ticket) return;
    let cancelled = false;
    api
      .get<{ timeEntries?: TimeEntry[] }>(`/time-tracking?ticket_id=${id}`)
      .then((data) => {
        if (!cancelled) setTimeEntries(data.timeEntries ?? []);
      })
      .catch(() => {
        if (!cancelled) setTimeEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ticket]);

  const fetchComments = () => {
    if (!id) return;
    api
      .get<{ comments: TicketComment[] }>(`/tickets/${id}/comments`)
      .then((data) => setComments(data.comments))
      .catch(() => setComments([]));
  };

  const fetchActivities = () => {
    if (!id) return;
    api
      .get<{ activities: TicketActivity[] }>(`/tickets/${id}/activities`)
      .then((data) => setActivities(data.activities))
      .catch(() => setActivities([]));
  };

  const fetchTicketTodos = () => {
    if (!id) return;
    api
      .get<{ todos: Todo[] }>(`/todos?ticket_id=${encodeURIComponent(id)}`)
      .then((data) => setTicketTodos(data.todos))
      .catch(() => setTicketTodos([]));
  };

  useEffect(() => {
    if (!id || !ticket) return;
    let cancelled = false;
    api
      .get<{ comments: TicketComment[] }>(`/tickets/${id}/comments`)
      .then((data) => {
        if (!cancelled) setComments(data.comments);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ticket]);

  useEffect(() => {
    if (!id || !ticket) return;
    let cancelled = false;
    api
      .get<{ activities: TicketActivity[] }>(`/tickets/${id}/activities`)
      .then((data) => {
        if (!cancelled) setActivities(data.activities);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ticket]);

  useEffect(() => {
    if (!id || !ticket) return;
    let cancelled = false;
    api
      .get<{ todos: Todo[] }>(`/todos?ticket_id=${encodeURIComponent(id)}`)
      .then((data) => {
        if (!cancelled) setTicketTodos(data.todos);
      })
      .catch(() => {
        if (!cancelled) setTicketTodos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, ticket]);

  useEffect(() => {
    if (!user) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (notFound || !ticket) {
    if (!canViewTickets) {
      return (
        <AccessDeniedWarning
          message={
            <>
              You don&apos;t have permission to access the Tickets module. Please contact an
              administrator. If you believe this is a mistake, you can also create a support ticket.
            </>
          }
          primaryLabel="Create Ticket"
          customPrimary={
            <AccessIssueTicketDialog
              primaryLabel="Create Ticket"
              hiddenFields={{ context: "ticket_detail", entityId: id ?? "" }}
              dialogDescription="If you believe you should have access to the Tickets module, please describe why. Your explanation will be included in the support ticket."
            />
          }
          secondaryHref={ROUTES.DASHBOARD}
          secondaryLabel="Back to Dashboard"
        />
      );
    }
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="mb-6">
            <svg
              className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M4.93 19.07A10 10 0 1119.07 4.93 10 10 0 014.93 19.07z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Ticket not found
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            The ticket you&apos;re trying to access doesn&apos;t exist or you don&apos;t have permission to view it.
          </p>
          <Link to={`${ROUTES.DASHBOARD}/tickets`}>
            <Button variant="primary">Back to Tickets</Button>
          </Link>
        </div>
      </div>
    );
  }

  const description = ticket.description_plain ?? ticket.description ?? "";

  return (
    <div className="space-y-6">
      {/* Header - same structure as Next.js */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link to={`${ROUTES.DASHBOARD}/tickets`}>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              {ticket.title}
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              Created {formatDateTime(ticket.created_at)}
            </p>
          </div>
        </div>
        {isAgent && (
          <TicketDetailHeaderActions
            ticketId={ticket.id}
            ticketNumber={ticket.ticket_number}
            editHref={`${ROUTES.DASHBOARD}/tickets/${ticket.id}/edit`}
            canDelete={canDeleteTicket}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - same as Next.js */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ticket Description */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Description
            </h2>
            <RichTextDisplay content={description} />
          </div>

          {/* Tasks for this ticket */}
          <TasksSection
            ticketId={ticket.id}
            tasks={ticketTodos}
            canManage={isAgent || can("todos.assign")}
            onRefresh={fetchTicketTodos}
          />

          {/* Comments and Activity */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <TicketCommentsAndActivity
              ticketId={ticket.id}
              comments={comments}
              activities={activities}
              showAgentCommentOptions={isAgent || can(PERM.TICKETS_COMMENTS_AGENT_ONLY)}
              onCommentAdded={() => {
                fetchComments();
                fetchActivities();
                api.get<{ ticket: Ticket }>(`/tickets/${id}`).then((data) => setTicket(data.ticket));
              }}
              onStatusChange={() => {
                fetchActivities();
                api.get<{ ticket: Ticket }>(`/tickets/${id}`).then((data) => setTicket(data.ticket));
              }}
            />
          </div>
        </div>

        {/* Sidebar - Ticket Information card like Next.js */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
              Ticket Information
            </h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Ticket ID
                </span>
                <p className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400">
                  {ticket.ticket_number}
                </p>
              </div>

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Type
                </span>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                  {getTicketTypeLabel((ticket.type || "QUESTION") as TicketType)}
                </span>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4" />

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Status
                </span>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                    ticket.status
                  )}`}
                >
                  {ticket.status.replace(/_/g, " ")}
                </span>
              </div>

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Priority
                </span>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(
                    ticket.priority
                  )}`}
                >
                  {ticket.priority}
                </span>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4" />

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created By
                </span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatUserName(ticket.created_by)}
                </p>
              </div>

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Assigned To
                </span>
                {ticket.assigned_to ? (
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatUserName(ticket.assigned_to)}
                  </p>
                ) : (
                  <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">Unassigned</p>
                )}
              </div>

              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Assigned To Group
                </span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {ticket.assigned_to_group ? (
                    <>
                      {ticket.assigned_to_group.name}
                      {ticket.assigned_to_group.description && (
                        <span className="block text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          {ticket.assigned_to_group.description}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-500 dark:text-neutral-500 italic">No group assignment</span>
                  )}
                </p>
              </div>

              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4" />

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Created
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTime(ticket.created_at)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Last Updated
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTime(ticket.updated_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {canViewTimeTracking && isAgent && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
              <TicketTimerSection
                ticketId={ticket.id}
                ticketNumber={ticket.ticket_number}
                ticketTitle={ticket.title}
                initialTimeEntries={timeEntries
                  .filter((e) => e.status === "RUNNING" || e.status === "PAUSED")
                  .map((e) => ({
                    id: e.id,
                    name: e.name,
                    description: e.description,
                    status: e.status,
                    started_at: e.started_at,
                    total_duration: e.total_duration,
                    last_resumed_at: e.last_resumed_at,
                  }))}
                userTimezone={user?.timezone ?? "UTC"}
                canCreate={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
