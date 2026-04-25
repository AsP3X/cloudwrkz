import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { TaskForm } from "@/components/features/tasks/TaskForm";
import type { TaskFormUser, TaskFormTicket } from "@/components/features/tasks/TaskForm";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

// Human: Task creation page that preloads assignable users and related tickets when permissions allow linking work.
// Agent: FETCH /admin/users conditional on canAssign; FETCH /tickets; RENDERS TaskForm; GATED modules.todos.view.

// Human: Coordinates loading state and passes hydrated picklists into TaskForm for new todo/task submission.
// Agent: STATE users,tickets,loading; canViewTodos early exit; Promise.all loader.

export default function TodoNewPage() {
  const { user, can } = useAuth();
  const [users, setUsers] = useState<TaskFormUser[]>([]);
  const [tickets, setTickets] = useState<TaskFormTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const canViewTodos = can("modules.todos.view");
  const canAssign =
    user?.role === "ADMIN" ||
    user?.role === "AGENT" ||
    user?.role === "MODERATOR" ||
    can("todos.assign");

  useEffect(() => {
    if (!canViewTodos) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      canAssign ? api.get<{ users?: Array<{ id: string; email: string; name: string | null }> }>("/admin/users?limit=500").then((r) => r.users ?? []) : [],
      api.get<{ tickets?: Array<{ id: string; ticket_number: string; title: string }> }>("/tickets?limit=50").then((r) => r.tickets ?? []),
    ])
      .then(([userList, ticketList]) => {
        if (!cancelled) {
          setUsers(userList as TaskFormUser[]);
          setTickets(ticketList as TaskFormTicket[]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewTodos, canAssign]);

  if (!canViewTodos) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the ToDo module. Please contact an administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "todo_create" }}
            dialogDescription="If you believe you should have access to create ToDos, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link to={`${ROUTES.DASHBOARD}/todos`} className="flex-shrink-0">
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to ToDos
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">Create New ToDo</h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">Create a new ToDo to track work and progress</p>
        </div>
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <TaskForm users={users} tickets={tickets} canAssign={canAssign} />
      </div>
    </div>
  );
}
