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
import type { LoginQueuedUiState } from "@/components/providers/AuthProvider";
import { LoginQueuedBanner } from "@/features/auth/LoginQueuedBanner";

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

const CREATE_TODO_API_PATH = "/todos";

export function TaskForm({ users = [], tickets = [], canAssign = false }: TaskFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [createQueuedUi, setCreateQueuedUi] = React.useState<LoginQueuedUiState | null>(null);
  const [offlineCreateQueuedUi, setOfflineCreateQueuedUi] = React.useState<LoginQueuedUiState | null>(null);
  /** Set when submit starts; cleared in `finally` so the banner covers local → API → DB for the whole request. */
  const [pipelineStartedAt, setPipelineStartedAt] = React.useState<number | null>(null);

  const pipelinePhaseUi: LoginQueuedUiState | null =
    pipelineStartedAt !== null && !offlineCreateQueuedUi && !createQueuedUi
      ? {
          headline: "Create ToDo queued",
          supportLines: [
            "Local → API → database: your create request is in the pipeline.",
            "Stay on this page until it completes—do not press Create again.",
          ],
          maxWaitSecs: 0,
          startedAt: pipelineStartedAt,
        }
      : null;

  const createQueuedBannerState =
    offlineCreateQueuedUi ?? createQueuedUi ?? pipelinePhaseUi;

  React.useEffect(() => {
    const onQueued = (e: Event) => {
      const d = (
        e as CustomEvent<{
          path: string;
          retry_deadline_secs: number;
        }>
      ).detail;
      if (d.path !== CREATE_TODO_API_PATH) return;
      const retry = d.retry_deadline_secs ?? 30;
      const maxWaitSecs = retry + 5;
      setCreateQueuedUi({
        headline: "Creating ToDo",
        supportLines: [
          "Your create request was accepted with HTTP 202: the API applies it in the background, including automatic retries if the database was briefly unavailable.",
          `If Postgres was down when you submitted, the server retries for up to about ${retry} seconds—stay on this page.`,
          "We poll job status about once per second—do not press Create again unless this times out or fails.",
          `If nothing completes within about ${maxWaitSecs} seconds, you will see an error above.`,
        ],
        maxWaitSecs,
        startedAt: Date.now(),
      });
    };
    window.addEventListener("cloudwrkz:mutation-queued", onQueued);
    return () => {
      window.removeEventListener("cloudwrkz:mutation-queued", onQueued);
    };
  }, []);

  React.useEffect(() => {
    const onOfflineEnqueued = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (d.path !== CREATE_TODO_API_PATH || d.method !== "POST") return;
      setOfflineCreateQueuedUi({
        headline: "Create ToDo queued",
        supportLines: [
          "The server could not be reached. Your create request is saved on this device.",
          "It will send automatically when your connection is working again. Stay on this page or return later.",
          "Do not create the same ToDo again elsewhere until this completes or you see an error above.",
        ],
        maxWaitSecs: 0,
        startedAt: Date.now(),
      });
    };
    const onOfflineFinished = (e: Event) => {
      const d = (e as CustomEvent<{ path: string; method: string }>).detail;
      if (d.path !== CREATE_TODO_API_PATH || d.method !== "POST") return;
      setOfflineCreateQueuedUi(null);
    };
    window.addEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
    window.addEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    return () => {
      window.removeEventListener("cloudwrkz:offline-mutation-enqueued", onOfflineEnqueued);
      window.removeEventListener("cloudwrkz:offline-mutation-finished", onOfflineFinished);
    };
  }, []);

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
    setCreateQueuedUi(null);
    setPipelineStartedAt(Date.now());
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
    } finally {
      setPipelineStartedAt(null);
      setCreateQueuedUi(null);
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
        disabled={Boolean(createQueuedBannerState)}
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
              disabled={Boolean(createQueuedBannerState)}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          disabled={Boolean(createQueuedBannerState)}
          {...register("status")}
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          error={errors.priority?.message}
          disabled={Boolean(createQueuedBannerState)}
          {...register("priority")}
        />
      </div>

      {(canAssign && users.length > 0) && (
        <Select
          label="Assign To"
          options={userOptions}
          error={errors.assignedToId?.message}
          disabled={Boolean(createQueuedBannerState)}
          {...register("assignedToId")}
        />
      )}

      {tickets.length > 0 && (
        <Select
          label="Link to Ticket"
          options={ticketOptions}
          error={errors.ticketId?.message}
          disabled={Boolean(createQueuedBannerState)}
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
          disabled={Boolean(createQueuedBannerState)}
          {...register("estimatedHours")}
        />
        <Input
          label="Start Date"
          type="date"
          error={errors.startDate?.message}
          disabled={Boolean(createQueuedBannerState)}
          {...register("startDate")}
        />
        <Input
          label="Due Date"
          type="date"
          error={errors.dueDate?.message}
          disabled={Boolean(createQueuedBannerState)}
          {...register("dueDate")}
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`${ROUTES.DASHBOARD}/todos`)}
          disabled={isSubmitting || Boolean(createQueuedBannerState)}
        >
          Cancel
        </Button>
        {createQueuedBannerState ? (
          <LoginQueuedBanner
            shrinkToContent
            state={createQueuedBannerState}
            className="min-h-[3rem] self-end sm:self-center"
          />
        ) : (
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
            Create ToDo
          </Button>
        )}
      </div>
    </form>
  );
}
