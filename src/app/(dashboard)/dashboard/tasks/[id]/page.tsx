import { getCurrentUser } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { formatUserName } from "@/lib/utils/users";
import { formatDateTimeInTimezone, formatDateInTimezone } from "@/lib/utils/date";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTask } from "@/server/actions/tasks";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getAgents, getAllUsers } from "@/server/actions/users";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { TaskDetailHeader } from "./TaskDetailHeader";
import { TaskDetailContent } from "./TaskDetailContent";
import { TaskEditForm } from "@/components/features/tasks/TaskEditForm";
import { getTickets } from "@/server/actions/tickets";
import { TaskStatusPriorityFields } from "@/components/features/tasks/TaskStatusPriorityFields";
import { TaskAssigneeField } from "@/components/features/tasks/TaskAssigneeField";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
}

// Force dynamic rendering to prevent caching issues
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
  const { id } = await params;
  const { mode } = (await searchParams) || {};
  const isEditingRequested = mode === "edit";
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view tasks module (module enabled AND user has permission)
  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TASKS);

  if (!canViewTasks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Tasks module. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // getTask already checks for permissions
  // It returns null if the user doesn't have access
  const task = await getTask(id);

  if (!task) {
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
            You don&apos;t have permission to view this task. The permission may have been removed or you may not have been granted access.
          </p>
          <Link href="/dashboard/tasks">
            <Button variant="primary">Back to Tasks</Button>
          </Link>
        </div>
      </div>
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

  const canEdit = isAgent || await hasPermission(user.id, "tasks.update");
  const canDelete = isAgent || await hasPermission(user.id, "tasks.delete");
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
      (await hasPermission(user.id, "tasks.assign"));

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
    <div className="space-y-6">
      {/* Header */}
      <TaskDetailHeader
        taskId={task.id}
        taskTitle={task.title}
        createdAt={task.createdAt}
        canEdit={canEdit}
        canDelete={canDelete}
        description={task.description}
        descriptionHtml={(task as any).descriptionHtml}
        parentTaskId={task.parentTask?.id}
        isEditing={isEditing}
        userTimezone={userTimezone}
        subtasks={task.subtasks || []}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
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
              {/* Task Description - Desktop only */}
              {(task as any).descriptionHtml || task.description ? (
                <div className="hidden sm:block bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
                  <RichTextDisplay
                    content={(task as any).descriptionHtml || task.description || ""}
                  />
                </div>
              ) : null}

              {/* Subtasks Section - rendered as its own element (like overview page) */}
              <TaskDetailContent
                parentTaskId={task.id}
                subtasks={(task.subtasks || []).map((subtask) => ({
                  id: subtask.id,
                  title: subtask.title,
                  status: subtask.status,
                  priority: subtask.priority,
                  // these fields are optional for now; can be expanded later
                  dueDate: (subtask as any).dueDate ?? null,
                  assignedTo: (subtask as any).assignedTo ?? null,
                  _count: (subtask as any)._count ?? { subtasks: 0 },
                }))}
                canManage={canEdit}
                userTimezone={userTimezone}
              />

              {/* Dependencies */}
              {task.dependencies && task.dependencies.length > 0 && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Dependencies ({task.dependencies.length})
                  </h2>
                  <div className="space-y-2">
                    {task.dependencies.map((dep) => (
                      <Link
                        key={dep.dependsOnTask.id}
                        href={`/dashboard/tasks/${dep.dependsOnTask.id}`}
                        className="block p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {dep.dependsOnTask.title}
                            </span>
                            <Badge className={cn(getStatusColor(dep.dependsOnTask.status), "text-xs")}>
                              {dep.dependsOnTask.status.replace("_", " ")}
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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Task Info Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">Task Information</h3>
              <div className="space-y-4">
                {/* Task Number */}
                {task.taskNumber && (
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Task Number
                    </label>
                    <p className="text-sm font-mono text-neutral-900 dark:text-neutral-100">
                      {task.taskNumber}
                    </p>
                  </div>
                )}

              {/* Status & Priority */}
              {isEditing && canEdit ? (
                <TaskStatusPriorityFields
                  taskId={task.id}
                  status={task.status}
                  priority={task.priority}
                />
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Status
                    </label>
                    <Badge className={cn(getStatusColor(task.status), "text-sm")}>
                      {task.status.replace("_", " ")}
                    </Badge>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Priority
                    </label>
                    <Badge className={cn(getPriorityColor(task.priority), "text-sm")}>
                      {task.priority}
                    </Badge>
                  </div>
                </>
              )}

                {/* Divider */}
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

              {/* Assigned To */}
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
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                    Assigned To
                  </label>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {formatUserName(task.assignedTo)}
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

                {/* Parent Task */}
                {task.parentTask && (
                  <>
                    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Parent Task
                      </label>
                      <Link
                        href={`/dashboard/tasks/${task.parentTask.id}`}
                        className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        {task.parentTask.title}
                      </Link>
                    </div>
                  </>
                )}


                {/* Ticket - Only show if task is linked to a ticket */}
                {task.ticket && (
                  <>
                    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Linked Ticket
                      </label>
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

                {/* Milestone */}
                {task.milestone && (
                  <>
                    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Milestone
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">
                        {task.milestone.name}
                      </p>
                    </div>
                  </>
                )}

                {/* Divider */}
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>

                {/* Dates */}
                <div className="space-y-2">
                  {task.startDate && (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Start Date
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTimeInTimezone(task.startDate, userTimezone)}</p>
                    </div>
                  )}
                  {task.dueDate && (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Due Date
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTimeInTimezone(task.dueDate, userTimezone)}</p>
                    </div>
                  )}
                  {task.completedDate && (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Completed Date
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTimeInTimezone(task.completedDate, userTimezone)}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                      Created
                    </label>
                    <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTimeInTimezone(task.createdAt, userTimezone)}</p>
                  </div>
                  {task.updatedAt && task.updatedAt.getTime() !== task.createdAt.getTime() && (
                    <div>
                      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                        Last Updated
                      </label>
                      <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTimeInTimezone(task.updatedAt, userTimezone)}</p>
                    </div>
                  )}
                </div>

                {/* Hours */}
                {(task.estimatedHours !== null || task.actualHours !== null) && (
                  <>
                    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4"></div>
                    <div className="space-y-2">
                      {task.estimatedHours !== null && (
                        <div>
                          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                            Estimated Hours
                          </label>
                          <p className="text-sm text-neutral-900 dark:text-neutral-100">
                            {task.estimatedHours.toFixed(1)}h
                          </p>
                        </div>
                      )}
                      {task.actualHours !== null && (
                        <div>
                          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">
                            Actual Hours
                          </label>
                          <p className="text-sm text-neutral-900 dark:text-neutral-100">
                            {task.actualHours.toFixed(1)}h
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
