import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { TaskForm } from "@/components/features/tasks/TaskForm";
import { getAllUsers } from "@/server/actions/users";
import { getTickets } from "@/server/actions/tickets";
import { hasPermission } from "@/lib/utils/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

export default async function NewTaskPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view ToDo module
  const canViewTodos = await canUserViewModule(user.id, MODULE_KEYS.TODOS);

  if (!canViewTodos) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the ToDo module. Please contact an
            administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "todo_create" }}
            dialogDescription="If you believe you should have access to create ToDos, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  // Check if user has permission to assign todos
  const canAssign = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "todos.assign");

  // Get users for assignment dropdown (only if user can assign)
  const users = canAssign ? await getAllUsers() : [];

  // Get recent tickets for linking (optional - tasks are independent)
  // Limit to recent tickets to keep the dropdown manageable
  const tickets = await getTickets({
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const recentTickets = tickets.slice(0, 50).map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard/todos" className="flex-shrink-0">
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to ToDos
            </Button>
          </Link>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Create New ToDo
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Create a new ToDo to track work and progress
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <TaskForm users={users} tickets={recentTickets} canAssign={canAssign} />
      </div>
    </div>
  );
}
