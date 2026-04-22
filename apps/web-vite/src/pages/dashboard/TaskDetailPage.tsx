import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Badge } from "@/components/ui/Badge";
import type { Todo } from "@/lib/types";
import { formatDateTime } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { TaskDeleteDialog } from "@/components/features/tasks/TaskDeleteDialog/TaskDeleteDialog";
import { SubtasksSection } from "@/components/features/tasks/SubtasksSection/SubtasksSection";
import { updateTodoSchema, type UpdateTodoInput } from "@/lib/validations/todos";
import { cn } from "@/lib/utils/cn";

// Human: Full task (todo) detail workspace with sidebar layout, rich text, subtasks, and guarded mutations.
// Agent: GET/PATCH todos/:id; react-hook-form+zod; SidebarContext; REQUIRES todos permissions; URL searchParams tab.

/* ─── Constants ─── */

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

// Human: Maps todo workflow statuses to Tailwind badge classes for consistent chips in the header and list.
// Agent: SWITCH status NOT_STARTED|IN_PROGRESS|BLOCKED|COMPLETED|CANCELLED|default; RETURNS className string.

function getStatusColor(status: string): string {
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
}

// Human: Color-codes priority levels so urgent work stands out visually next to status metadata.
// Agent: SWITCH priority URGENT|HIGH|MEDIUM|LOW|default; RETURNS Tailwind utility bundle string.

function getPriorityColor(priority: string): string {
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
}

/* ─── Sidebar context (mirrors Next.js TaskDetailWrapper + TaskDetailLayout) ─── */

// Human: Lightweight React context mirroring the legacy layout so collapsible sidebar state is shared locally.
// Agent: createContext isOpen+setIsOpen; export useSidebar READS SidebarContext; REQUIRES provider in TaskDetailPage tree.

const SidebarContext = createContext<{ isOpen: boolean; setIsOpen: (o: boolean) => void }>({
  isOpen: true,
  setIsOpen: () => {},
});
export const useSidebar = () => useContext(SidebarContext);

/* ─── Icons ─── */

const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ─── Page ─── */

// Human: Main task route coordinating fetches, permission gates, form submission, and sidebar-driven navigation.
// Agent: STATE task,loading,forms; useParams id; useSearchParams tab; MUTATES via api; PROVIDES SidebarContext.

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const [task, setTask] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const modeEdit = searchParams.get("mode") === "edit";
  const canViewTodos = can("modules.todos.view");
  const isAgent = user?.role === "AGENT" || user?.role === "ADMIN" || user?.role === "MODERATOR";

  /* ─── Form ─── */
  const form = useForm<UpdateTodoInput>({
    resolver: zodResolver(updateTodoSchema),
    defaultValues: { title: "", description: "", status: "NOT_STARTED", priority: "MEDIUM", assignedToId: "", startDate: "", dueDate: "", ticketId: "" },
  });

  /* ─── Fetch ─── */
  const fetchTask = useCallback(() => {
    if (!id || id === "undefined") return;
    api
      .get<{ todo: Todo }>(`/todos/${id}`)
      .then((data) => { setTask(data.todo); setNotFound(false); })
      .catch(() => { setTask(null); setNotFound(true); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || id === "undefined") { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    api.get<{ todo: Todo }>(`/todos/${id}`)
      .then((d) => { if (!cancelled) setTask(d.todo); })
      .catch(() => { if (!cancelled) { setTask(null); setNotFound(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (task) {
      form.reset({
        title: task.title,
        description: task.description_html ?? task.description ?? "",
        status: task.status as UpdateTodoInput["status"],
        priority: task.priority as UpdateTodoInput["priority"],
        assignedToId: task.assigned_to_id ?? "",
        startDate: task.start_date ?? "",
        dueDate: task.due_date ?? "",
        ticketId: task.ticket_id ?? "",
      });
    }
  }, [task, form]);

  /* ─── Mobile drawer: escape + body scroll lock + breakpoint ─── */
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileDrawerOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mql.matches) setMobileDrawerOpen(false); };
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  /* ─── Guards ─── */
  if (!canViewTodos) {
    return (
      <AccessDeniedWarning
        message={<>You don&apos;t have permission to access the ToDo module. Please contact an administrator.</>}
        primaryLabel="Create Ticket"
        customPrimary={<AccessIssueTicketDialog primaryLabel="Create Ticket" hiddenFields={{ context: "todos_module" }} dialogDescription="If you believe you should have access to the ToDo module, please describe why." />}
        secondaryHref={ROUTES.DASHBOARD} secondaryLabel="Back to Dashboard"
      />
    );
  }
  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" /></div>;
  }
  if (notFound || !task) {
    return (
      <AccessDeniedWarning
        message={<>You don&apos;t have permission to view this ToDo or it does not exist.</>}
        primaryLabel="Create Ticket"
        customPrimary={<AccessIssueTicketDialog primaryLabel="Create Ticket" hiddenFields={{ context: "todo_detail", entityId: id ?? "" }} dialogDescription="If you believe you should have access to this ToDo, please describe why." />}
        secondaryHref={`${ROUTES.DASHBOARD}/todos`} secondaryLabel="Back to ToDos"
      />
    );
  }

  /* ─── Derived ─── */
  const isOwner = task.assigned_to_id === user?.id;
  const canEdit = isAgent || isOwner || can("todos.update");
  const canDelete = isAgent || isOwner || can("todos.delete");
  const description = task.description_html ?? task.description ?? "";
  const backHref = task.parent_todo ? `${ROUTES.DASHBOARD}/todos/${task.parent_todo.id}` : `${ROUTES.DASHBOARD}/todos`;
  const backLabel = task.parent_todo ? "Back to Parent ToDo" : "Back to ToDos";
  const editHref = modeEdit ? `${ROUTES.DASHBOARD}/todos/${task.id}` : `${ROUTES.DASHBOARD}/todos/${task.id}?mode=edit`;
  const editLabel = modeEdit ? "Cancel Editing" : "Edit ToDo";
  const dependencies = task.dependencies ?? [];
  const subtodos = task.subtodos ?? [];

  /* ─── Handlers ─── */
  const onEditSubmit = async (data: UpdateTodoInput) => {
    setEditError(null);
    try {
      await api.patch(`/todos/${task.id}`, {
        title: data.title,
        description: (data.description || "").trim() || undefined,
        status: data.status, priority: data.priority,
        assigned_to_id: data.assignedToId && data.assignedToId !== "" ? data.assignedToId : null,
        ticket_id: data.ticketId && data.ticketId !== "" ? data.ticketId : null,
        start_date: data.startDate && data.startDate.trim() ? data.startDate : null,
        due_date: data.dueDate && data.dueDate.trim() ? data.dueDate : null,
      });
      setSearchParams({});
      fetchTask();
    } catch (err: unknown) {
      setEditError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to update task.");
    }
  };

  const handleDeleteConfirm = async () => {
    await api.delete(`/todos/${task.id}`);
    setDeleteDialogOpen(false);
    navigate(backHref);
  };

  /* ─── Sidebar content (same fields as Next.js) ─── */
  const sidebarContent = (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Task Number</span>
        <p className="text-sm font-mono text-neutral-900 dark:text-neutral-100">{task.todo_number ?? "—"}</p>
      </div>
      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Status</span>
        <Badge className={cn(getStatusColor(task.status), "text-sm")}>{task.status.replace(/_/g, " ")}</Badge>
      </div>
      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Priority</span>
        <Badge className={cn(getPriorityColor(task.priority), "text-sm")}>{task.priority}</Badge>
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
      <div>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Assigned To</span>
        {task.assigned_to ? (
          <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatUserName(task.assigned_to)}</p>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-500 italic">Unassigned</p>
        )}
      </div>
      {task.parent_todo && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Parent Task</span>
            <Link to={`${ROUTES.DASHBOARD}/todos/${task.parent_todo.id}`} className="text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{task.parent_todo.title}</Link>
          </div>
        </>
      )}
      {task.ticket && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Linked Ticket</span>
            <Link to={`${ROUTES.DASHBOARD}/tickets/${task.ticket.id}`} className="flex items-center gap-2 text-sm text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              <span className="font-medium">{task.ticket.ticket_number}</span>
              <span className="text-neutral-500 dark:text-neutral-500">-</span>
              <span>{task.ticket.title}</span>
            </Link>
          </div>
        </>
      )}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
      <div className="space-y-2">
        {task.start_date && (
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Start Date</span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(task.start_date)}</p>
          </div>
        )}
        {task.due_date && (
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Due Date</span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(task.due_date)}</p>
          </div>
        )}
        {task.completed_date && (
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Completed Date</span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(task.completed_date)}</p>
          </div>
        )}
        <div>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Created</span>
          <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(task.created_at)}</p>
        </div>
        {task.updated_at && task.updated_at !== task.created_at && (
          <div>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Last Updated</span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{formatDateTime(task.updated_at)}</p>
          </div>
        )}
      </div>
      {(task.estimated_hours != null || task.actual_hours != null) && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4" />
          <div className="space-y-2">
            {task.estimated_hours != null && (
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Estimated Hours</span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">{Number(task.estimated_hours).toFixed(1)}h</p>
              </div>
            )}
            {task.actual_hours != null && (
              <div>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-500 uppercase tracking-wide mb-1 block">Actual Hours</span>
                <p className="text-sm text-neutral-900 dark:text-neutral-100">{Number(task.actual_hours).toFixed(1)}h</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  /* ─── Edit mode ─── */
  if (modeEdit && canEdit) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`${ROUTES.DASHBOARD}/todos/${task.id}`}><Button variant="outline" size="sm">Cancel</Button></Link>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Edit ToDo</h1>
          {editError && (
            <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4 mb-4">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{editError}</p>
            </div>
          )}
          <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-6" noValidate>
            <Input label="Title" error={form.formState.errors.title?.message} required {...form.register("title")} />
            <Controller name="description" control={form.control} render={({ field }) => <RichTextEditor label="Description" value={field.value || ""} onChange={field.onChange} />} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select label="Status" options={STATUS_OPTIONS} {...form.register("status")} />
              <Select label="Priority" options={PRIORITY_OPTIONS} {...form.register("priority")} />
            </div>
            <Input label="Start Date" type="date" {...form.register("startDate")} />
            <Input label="Due Date" type="date" {...form.register("dueDate")} />
            <div className="flex gap-3">
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={form.formState.isSubmitting}>Save</Button>
              <Link to={`${ROUTES.DASHBOARD}/todos/${task.id}`}><Button type="button" variant="outline">Cancel</Button></Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ─── View mode (matches Next.js TaskDetailWrapper → TaskDetailHeader → TaskDetailLayout) ─── */
  return (
    <SidebarContext.Provider value={{ isOpen: sidebarOpen, setIsOpen: setSidebarOpen }}>
      <div className="space-y-6">
        {/* ─── TaskDetailHeader ─── */}
        <div className="space-y-4">
          {/* Action buttons: Back left, Edit/Delete right */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to={backHref}>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {backLabel}
              </Button>
            </Link>

            {/* Mobile: edit/delete */}
            <div className="flex items-center gap-2 sm:hidden">
              {canEdit && (
                <Link to={editHref}><Button variant="primary" size="sm" className="w-auto">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  {editLabel}
                </Button></Link>
              )}
              {canDelete && (
                <Button variant="danger" size="sm" className="w-auto" onClick={() => setDeleteDialogOpen(true)} aria-label="Delete ToDo">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </Button>
              )}
            </div>

            {/* Desktop: edit/delete - offset by sidebar width */}
            <div className={cn(
              "hidden sm:flex flex-wrap items-center gap-2 flex-shrink-0 lg:transition-all lg:duration-300 lg:ease-in-out",
              sidebarOpen ? "lg:mr-[360px]" : "lg:mr-12"
            )}>
              {canEdit && (
                <Link to={editHref}><Button variant="primary" size="sm" className="w-full sm:w-auto">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  {editLabel}
                </Button></Link>
              )}
              {canDelete && (
                <Button variant="danger" size="sm" className="w-full sm:w-auto" onClick={() => setDeleteDialogOpen(true)}>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Delete ToDo
                </Button>
              )}
            </div>
          </div>

          {/* Title centred, accounting for sidebar */}
          <div className={cn(
            "w-full flex justify-center lg:transition-all lg:duration-300 lg:ease-in-out",
            sidebarOpen ? "lg:max-w-[calc(100%-372px)]" : "lg:max-w-[calc(100%-60px)]"
          )}>
            <div className="text-center w-full max-w-4xl">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 break-words mb-2">{task.title}</h1>
              <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400">Created {formatDateTime(task.created_at)}</p>
              {/* Description on mobile (hidden on sm+, shown in main content there) */}
              {description && (
                <div className="sm:hidden mt-4"><RichTextDisplay content={description} /></div>
              )}
            </div>
          </div>
        </div>

        {/* ─── TaskDetailLayout ─── */}
        <div className="relative">
          {/* Mobile sidebar toggle tab */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((v) => !v)}
            aria-expanded={mobileDrawerOpen}
            aria-label={mobileDrawerOpen ? "Close task information" : "Open task information"}
            className={cn(
              "lg:hidden fixed top-32 right-0 z-40",
              "flex items-center justify-center",
              "w-8 h-20",
              "bg-white dark:bg-neutral-800",
              "border border-l border-y border-r-0 border-neutral-300 dark:border-neutral-600",
              "rounded-l-full",
              "shadow-lg hover:shadow-xl",
              "hover:bg-neutral-50 dark:hover:bg-neutral-700",
              "active:bg-neutral-100 dark:active:bg-neutral-600",
              "transition-all duration-200 touch-manipulation"
            )}
          >
            {mobileDrawerOpen ? (
              <ChevronRightIcon className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
            ) : (
              <ChevronLeftIcon className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
            )}
          </button>

          <div className="flex items-start">
            {/* Main content – padding adjusts for sidebar */}
            <div className={cn(
              "flex-1 min-w-0 space-y-6",
              sidebarOpen ? "lg:pr-[372px]" : "lg:pr-[60px]"
            )}>
              {/* Description (desktop only – mobile shows under title) */}
              {description ? (
                <div className="hidden sm:block bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Description</h2>
                  <RichTextDisplay content={description} />
                </div>
              ) : null}

              {/* Subtasks */}
              <SubtasksSection
                parentTaskId={task.id}
                subtasks={subtodos}
                canManage={canEdit}
                canAddSubtasks={true}
                onRefetch={fetchTask}
              />

              {/* Dependencies */}
              {dependencies.length > 0 && (
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Dependencies ({dependencies.length})</h2>
                  <div className="space-y-2">
                    {dependencies.map((dep) => (
                      <Link key={dep.depends_on_todo.id} to={`${ROUTES.DASHBOARD}/todos/${dep.depends_on_todo.id}`} className="block p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{dep.depends_on_todo.title}</span>
                          <Badge className={cn(getStatusColor(dep.depends_on_todo.status), "text-xs")}>{dep.depends_on_todo.status.replace(/_/g, " ")}</Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Desktop fixed sidebar ─── */}
            <aside
              className={cn(
                "hidden lg:block shrink-0 fixed right-0 top-16 bottom-0 z-40",
                "transition-[width] duration-300 ease-in-out overflow-hidden",
                sidebarOpen ? "w-[360px]" : "w-12"
              )}
              aria-label="Task information sidebar"
            >
              <div className={cn(
                "h-full flex flex-col bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-lg",
                sidebarOpen ? "w-[360px]" : "w-12"
              )}>
                {sidebarOpen ? (
                  <>
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">Task information</p>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 px-0 min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => setSidebarOpen(false)} title="Collapse sidebar">
                        <ChevronRightIcon className="h-4 w-4 pointer-events-none" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 min-h-0">{sidebarContent}</div>
                  </>
                ) : (
                  <button type="button" onClick={() => setSidebarOpen(true)} className="h-full w-full flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer" title="Show task information">
                    <ChevronLeftIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400 pointer-events-none" />
                  </button>
                )}
              </div>
            </aside>
          </div>

          {/* ─── Mobile drawer ─── */}
          <div className={cn("lg:hidden fixed inset-0 z-50", mobileDrawerOpen ? "" : "pointer-events-none")} aria-hidden={!mobileDrawerOpen}>
            <div role="presentation" className={cn("absolute inset-0 bg-neutral-900/40 transition-opacity duration-200", mobileDrawerOpen ? "opacity-100" : "opacity-0")} onClick={() => setMobileDrawerOpen(false)} />
            <div role="dialog" aria-modal="true" aria-label="Task information" className={cn("absolute inset-y-0 right-0 w-[92vw] max-w-[420px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl transition-transform duration-200 ease-out flex flex-col", mobileDrawerOpen ? "translate-x-0" : "translate-x-full")}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">Task information</p>
                <Button type="button" variant="outline" size="sm" onClick={() => setMobileDrawerOpen(false)}>Close</Button>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
                  {sidebarContent}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete dialog */}
      {canDelete && (
        <TaskDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          apiMutationPath={`/todos/${task.id}`}
          taskTitle={task.title}
          subtasks={subtodos.map((s) => ({ id: s.id, title: s.title, status: s.status, priority: s.priority }))}
        />
      )}
    </SidebarContext.Provider>
  );
}
