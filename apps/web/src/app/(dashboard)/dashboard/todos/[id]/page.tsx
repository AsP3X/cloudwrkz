import { getCurrentUser } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { formatUserName } from "@/lib/utils/users";
import { formatDateTimeInTimezone, formatDateInTimezone } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTodo } from "@/server/actions/todos";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getAgents, getAllUsers } from "@/server/actions/users";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { TaskDetailHeader } from "./TaskDetailHeader";
import { TaskDetailContent } from "./TaskDetailContent";
import { TaskDetailLayout } from "./TaskDetailLayout";
import { TaskDetailWrapper } from "./TaskDetailWrapper";
import { TaskEditForm } from "@/components/features/tasks/TaskEditForm";
import { getTickets } from "@/server/actions/tickets";
import { TaskStatusPriorityFields } from "@/components/features/tasks/TaskStatusPriorityFields";
import { TaskAssigneeField } from "@/components/features/tasks/TaskAssigneeField";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

interface TodoDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
}

// Force dynamic rendering to prevent caching issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;


export default async function TodoDetailPage({ params, searchParams }: TodoDetailPageProps) {
  const { id } = await params;
  const { mode } = (await searchParams) || {};
  const isEditingRequested = mode === "edit";
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view ToDo module (module enabled AND user has permission)
  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TODOS);

  if (!canViewTasks) {
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
            hiddenFields={{ context: "todos_module" }}
            dialogDescription="If you believe you should have access to the ToDo module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  // getTodo already checks for permissions
  // It returns null if the user doesn't have access
  const task = await getTodo(id);

  if (!task) {
    // Show permission denied page instead of 404
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to view this ToDo. The permission may have been removed
            or you may not have been granted access. If you believe this is a mistake, you can
            create a support ticket so an administrator can review your access.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "todo_detail", entityId: id }}
            dialogDescription="If you believe you should have access to this ToDo, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref="/dashboard/todos"
        secondaryLabel="Back to ToDos"
      />
    );
  }

  // Get agents for assignment (only for agents/admins/moderators)
  const isAgent = user.role === "AGENT" || user.role === "ADMIN" || user.role === "MODERATOR";
  const agents = isAgent ? await getAgents() : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "NOT_STARTED":
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
      case "IN_PROGRESS":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "BLOCKED":
        return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
      case "COMPLETED":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "CANCELLED":
        return "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400";
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

  const canEdit = isAgent || await hasPermission(user.id, "todos.update");
  const canDelete = isAgent || await hasPermission(user.id, "todos.delete");
  const isEditing = isEditingRequested && canEdit;
  const userTimezone = user.timezone ?? "UTC";

  // For inline edit mode, load users and recent tickets (similar to the dedicated edit page)
  let assignableUsers: Awaited<ReturnType<typeof getAllUsers>> = [];
  let recentTickets:
    | Array<{
        id: string;
        ticketNumber: string;
        title: string;
      }>
    | [] = [];

  if (isEditing) {
      const canAssign =
      user.role === "ADMIN" ||
      user.role === "AGENT" ||
      user.role === "MODERATOR" ||
      (await hasPermission(user.id, "todos.assign"));

    assignableUsers = canAssign ? await getAllUsers() : [];

    const tickets = await getTickets({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    recentTickets = tickets.slice(0, 50).map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
    }));
  }


  return (
    <TaskDetailWrapper defaultSidebarOpen={true}>
      <div className="space-y-6">
        <TaskDetailHeader
          taskId={task.id}
          taskTitle={task.title}
          createdAt={task.createdAt}
          canEdit={canEdit}
          canDelete={canDelete}
          description={task.description}
          descriptionHtml={(task as any).descriptionHtml}
          parentTaskId={(task as any).parentTodo?.id}
          isEditing={isEditing}
          userTimezone={userTimezone}
          subtasks={(task as any).subtodos || []}
        />

        <TaskDetailLayout
        sidebar={
          <div className="space-y-4">
            {(task as any).todoNumber && (
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Task Number
                </span>
                <p className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                  {(task as any).todoNumber}
                </p>
              </div>
            )}

            {isEditing && canEdit ? (
              <TaskStatusPriorityFields
                taskId={task.id}
                status={task.status}
                priority={task.priority}
              />
            ) : (
              <>
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Status
                  </span>
                  <Badge className={cn(getStatusColor(task.status), "text-sm")}>
                    {task.status.replace("_", " ")}
                  </Badge>
                </div>

                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Priority
                  </span>
                  <Badge className={cn(getPriorityColor(task.priority), "text-sm")}>
                    {task.priority}
                  </Badge>
                </div>
              </>
            )}

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

            {isEditing && canEdit ? (
              <TaskAssigneeField
                taskId={task.id}
                assignedToId={task.assignedTo?.id || null}
                users={assignableUsers.map((u) => ({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                }))}
              />
            ) : task.assignedTo ? (
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Assigned To
                </span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatUserName(task.assignedTo)}
                </p>
              </div>
            ) : (
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Assigned To
                </span>
                <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">Unassigned</p>
              </div>
            )}

            {(task as any).parentTodo && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Parent Task
                  </span>
                  <Link
                    href={`/dashboard/todos/${(task as any).parentTodo.id}`}
                    className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    {(task as any).parentTodo.title}
                  </Link>
                </div>
              </>
            )}

            {task.ticket && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Linked Ticket
                  </span>
                  <Link
                    href={`/dashboard/tickets/${task.ticket.id}`}
                    className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    <span className="font-medium">{task.ticket.ticketNumber}</span>
                    <span className="text-neutral-500 dark:text-neutral-500">-</span>
                    <span>{task.ticket.title}</span>
                  </Link>
                </div>
              </>
            )}

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

            <div className="space-y-2">
              {task.startDate && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Start Date
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(task.startDate, userTimezone)}
                  </p>
                </div>
              )}
              {task.dueDate && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Due Date
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(task.dueDate, userTimezone)}
                  </p>
                </div>
              )}
              {task.completedDate && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Completed Date
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(task.completedDate, userTimezone)}
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                  Created
                </span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {formatDateTimeInTimezone(task.createdAt, userTimezone)}
                </p>
              </div>
              {task.updatedAt && task.updatedAt.getTime() !== task.createdAt.getTime() && (
                <div>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Last Updated
                  </span>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatDateTimeInTimezone(task.updatedAt, userTimezone)}
                  </p>
                </div>
              )}
            </div>

            {(task.estimatedHours !== null || task.actualHours !== null) && (
              <>
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                <div className="space-y-2">
                  {task.estimatedHours !== null && (
                    <div>
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Estimated Hours
                      </span>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">
                        {task.estimatedHours.toFixed(1)}h
                      </p>
                    </div>
                  )}
                  {task.actualHours !== null && (
                    <div>
                      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Actual Hours
                      </span>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">
                        {task.actualHours.toFixed(1)}h
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        }
      >
        {isEditing ? (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
            <TaskEditForm
              task={{
                id: task.id,
                title: task.title,
                description: (task as any).descriptionHtml || task.description,
              }}
            />
          </div>
        ) : (
          <>
            {(task as any).descriptionHtml || task.description ? (
              <div className="hidden sm:block bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
                <RichTextDisplay content={(task as any).descriptionHtml || task.description || ""} />
              </div>
            ) : null}

            <TaskDetailContent
              parentTaskId={task.id}
              subtasks={((task as any).subtodos || []).map((subtask: any) => ({
                id: subtask.id,
                title: subtask.title,
                status: subtask.status,
                priority: subtask.priority,
                dueDate: subtask.dueDate ?? null,
                assignedTo: subtask.assignedTo ?? null,
                _count: subtask._count ?? { subtasks: 0 },
              }))}
              canManage={canEdit}
              userTimezone={userTimezone}
            />

            {(task as any).dependencies && (task as any).dependencies.length > 0 && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  Dependencies ({task.dependencies.length})
                </h2>
                <div className="space-y-2">
                  {(task as any).dependencies.map((dep: any) => (
                    <Link
                      key={dep.dependsOnTodo.id}
                      href={`/dashboard/todos/${dep.dependsOnTodo.id}`}
                      className="block p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {dep.dependsOnTodo.title}
                          </span>
                          <Badge className={cn(getStatusColor(dep.dependsOnTodo.status), "text-xs")}>
                            {dep.dependsOnTodo.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </TaskDetailLayout>
      </div>
    </TaskDetailWrapper>
  );
}
