import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTodos } from "@/server/actions/todos";
import { hasPermission } from "@/lib/utils/permissions";
import { TaskFilterButton } from "@/components/features/tasks/TaskFilterButton";
import { TaskFilterLoader } from "@/components/features/tasks/TaskFilterLoader";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TasksPageClient } from "./TasksPageClient";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TodosPageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignee?: string;
    link?: string;
    kind?: string;
    sort?: string;
  }>;
}

export default async function TodosPage({ searchParams }: TodosPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

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
            hiddenFields={{ context: "todos_overview" }}
            dialogDescription="If you believe you should have access to the ToDo module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  // Build filters from search params
  const tasks = await getAllTodos({
    status: params.status,
    priority: params.priority,
    assignee: (params.assignee as any) || undefined,
    link: (params.link as any) || undefined,
    // By default, hide subtasks from the overview unless explicitly requested
    kind: (params.kind as any) || "root",
    // By default, hide archived todos from the overview
    archive: "unarchived",
    sort: params.sort,
  });

  // Check if user can create todos (ToDo module permission)
  // Todos are completely independent of projects
  const canCreateTasks = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "todos.create");

  return (
    <>
      {/* Auto-load last used task filters */}
      <TaskFilterLoader />
      <TasksPageClient
        tasks={tasks as any}
        canManage={canCreateTasks}
        userRole={user.role}
        userTimezone={user.timezone ?? "UTC"}
      />
    </>
  );
}
