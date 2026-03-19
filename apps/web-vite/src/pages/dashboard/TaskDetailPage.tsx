import { useState, useEffect } from "react";
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
import type { Todo } from "@/lib/types";
import { formatDateTime } from "@/lib/utils/date";
import { formatUserName } from "@/lib/utils/users";
import { RichTextDisplay } from "@/components/features/tickets/RichTextDisplay";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { updateTodoSchema, type UpdateTodoInput } from "@/lib/validations/todos";
import { cn } from "@/lib/utils/cn";

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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [task, setTask] = useState<Todo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const modeEdit = searchParams.get("mode") === "edit";

  const canViewTodos = can("modules.todos.view");
  const canEdit = user?.role === "AGENT" || user?.role === "ADMIN" || user?.role === "MODERATOR" || can("todos.update");

  const form = useForm<UpdateTodoInput>({
    resolver: zodResolver(updateTodoSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assignedToId: "",
      startDate: "",
      dueDate: "",
      ticketId: "",
    },
  });

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

  useEffect(() => {
    if (!id || id === "undefined") {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ todo: Todo }>(`/todos/${id}`)
      .then((data) => {
        if (!cancelled) setTask(data.todo);
      })
      .catch(() => {
        if (!cancelled) {
          setTask(null);
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
            hiddenFields={{ context: "todos_module" }}
            dialogDescription="If you believe you should have access to the ToDo module, please describe why. Your explanation will be included in the support ticket."
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

  if (notFound || !task) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to view this ToDo or it does not exist. If you believe this is a mistake, you can create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "todo_detail", entityId: id ?? "" }}
            dialogDescription="If you believe you should have access to this ToDo, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={`${ROUTES.DASHBOARD}/todos`}
        secondaryLabel="Back to ToDos"
      />
    );
  }

  const description = task.description_html ?? task.description ?? "";

  const onEditSubmit = async (data: UpdateTodoInput) => {
    setEditError(null);
    try {
      await api.patch(`/todos/${task.id}`, {
        title: data.title,
        description: (data.description || "").trim() || undefined,
        status: data.status,
        priority: data.priority,
        assigned_to_id: data.assignedToId && data.assignedToId !== "" ? data.assignedToId : null,
        ticket_id: data.ticketId && data.ticketId !== "" ? data.ticketId : null,
        start_date: data.startDate && data.startDate.trim() ? data.startDate : null,
        due_date: data.dueDate && data.dueDate.trim() ? data.dueDate : null,
      });
      setTask((prev) => (prev ? { ...prev, ...data } : null));
      navigate(`${ROUTES.DASHBOARD}/todos/${task.id}`, { replace: true });
    } catch (err: unknown) {
      setEditError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to update task.");
    }
  };

  if (modeEdit && canEdit) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`${ROUTES.DASHBOARD}/todos/${task.id}`}>
            <Button variant="outline" size="sm">Cancel</Button>
          </Link>
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
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <RichTextEditor label="Description" value={field.value || ""} onChange={field.onChange} />
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select label="Status" options={STATUS_OPTIONS} {...form.register("status")} />
              <Select label="Priority" options={PRIORITY_OPTIONS} {...form.register("priority")} />
            </div>
            <Input label="Start Date" type="date" {...form.register("startDate")} />
            <Input label="Due Date" type="date" {...form.register("dueDate")} />
            <div className="flex gap-3">
              <Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={form.formState.isSubmitting}>
                Save
              </Button>
              <Link to={`${ROUTES.DASHBOARD}/todos/${task.id}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`${ROUTES.DASHBOARD}/todos`}>
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to ToDos
          </Button>
        </Link>
        {canEdit && (
          <Link to={`${ROUTES.DASHBOARD}/todos/${task.id}/edit`}>
            <Button variant="primary" size="sm">
              Edit
            </Button>
          </Link>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">{task.title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-500 mb-4">
          {task.todo_number && <span className="font-mono mr-2">{task.todo_number}</span>}
          Created {formatDateTime(task.created_at)}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className={cn("inline-block px-3 py-1 rounded-full text-sm font-medium", getStatusColor(task.status))}>
            {task.status.replace(/_/g, " ")}
          </span>
          <span className={cn("inline-block px-3 py-1 rounded-full text-sm font-medium", getPriorityColor(task.priority))}>
            {task.priority}
          </span>
        </div>

        {task.assigned_to && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Assigned to {formatUserName(task.assigned_to)}
          </p>
        )}

        {description && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Description</h2>
            <RichTextDisplay content={description} />
          </div>
        )}

        {task.due_date && (
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-4">
            Due {formatDateTime(task.due_date)}
          </p>
        )}
      </div>
    </div>
  );
}
