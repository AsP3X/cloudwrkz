import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTodoSchema, type CreateTodoInput } from "@/lib/validations/todos";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";

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

export interface TaskFormUser {
  id: string;
  email: string;
  name: string | null;
}

export interface TaskFormTicket {
  id: string;
  ticket_number: string;
  title: string;
}

interface TaskFormProps {
  users?: TaskFormUser[];
  tickets?: TaskFormTicket[];
  canAssign?: boolean;
}

export function TaskForm({ users = [], tickets = [], canAssign = false }: TaskFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const userOptions = [
    { value: "", label: "Unassigned" },
    ...users.map((u) => ({ value: u.id, label: u.name || u.email })),
  ];

  const ticketOptions = [
    { value: "", label: "No Ticket" },
    ...tickets.map((t) => ({ value: t.id, label: `${t.ticket_number} - ${t.title}` })),
  ];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTodoInput>({
    resolver: zodResolver(createTodoSchema),
    defaultValues: {
      status: "NOT_STARTED",
      priority: "MEDIUM",
      assignedToId: "",
      ticketId: "",
      estimatedHours: undefined,
      startDate: "",
      dueDate: "",
    },
  });

  const onSubmit = async (data: CreateTodoInput) => {
    setServerError(null);
    try {
      const body: Record<string, unknown> = {
        title: data.title.trim(),
        description: (data.description || "").trim() || undefined,
        status: data.status,
        priority: data.priority,
        assigned_to_id: data.assignedToId && data.assignedToId !== "" ? data.assignedToId : undefined,
        ticket_id: data.ticketId && data.ticketId !== "" ? data.ticketId : undefined,
        estimated_hours: data.estimatedHours,
        start_date: data.startDate && data.startDate.trim() ? data.startDate : undefined,
        due_date: data.dueDate && data.dueDate.trim() ? data.dueDate : undefined,
      };
      await api.post<{ id: string }>("/todos", body);
      navigate(`${ROUTES.DASHBOARD}/todos`);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create task. Please try again.";
      setServerError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4">
          <p className="text-sm font-medium text-error-800 dark:text-error-200">{serverError}</p>
        </div>
      )}

      <Input
        label="ToDo Title"
        type="text"
        placeholder="Brief description of the todo"
        error={errors.title?.message}
        required
        {...register("title")}
      />

      <div>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <RichTextEditor
              label="Description"
              placeholder="Provide detailed information about the ToDo..."
              error={errors.description?.message}
              value={field.value || ""}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register("status")}
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          error={errors.priority?.message}
          {...register("priority")}
        />
      </div>

      {(canAssign && users.length > 0) && (
        <Select
          label="Assign To"
          options={userOptions}
          error={errors.assignedToId?.message}
          {...register("assignedToId")}
        />
      )}

      {tickets.length > 0 && (
        <Select
          label="Link to Ticket"
          options={ticketOptions}
          error={errors.ticketId?.message}
          {...register("ticketId")}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Input
          label="Estimated Hours"
          type="number"
          placeholder="0"
          step="0.1"
          min={0}
          error={errors.estimatedHours?.message}
          {...register("estimatedHours")}
        />
        <Input label="Start Date" type="date" error={errors.startDate?.message} {...register("startDate")} />
        <Input label="Due Date" type="date" error={errors.dueDate?.message} {...register("dueDate")} />
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={() => navigate(`${ROUTES.DASHBOARD}/todos`)} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
          Create ToDo
        </Button>
      </div>
    </form>
  );
}
