import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTicketSchema, type CreateTicketInput } from "@/lib/validations/tickets";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { TICKET_TYPE_LABELS, type TicketType } from "@/lib/utils/tickets";

// Human: React UI for `TicketForm` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketForm; REACT component; READS props hooks; MAY CALL api client.
const TICKET_TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
  { value: "BUG", label: TICKET_TYPE_LABELS.BUG },
  { value: "SUPPORT", label: TICKET_TYPE_LABELS.SUPPORT },
  { value: "FEATURE", label: TICKET_TYPE_LABELS.FEATURE },
  { value: "QUESTION", label: TICKET_TYPE_LABELS.QUESTION },
  { value: "TASK", label: TICKET_TYPE_LABELS.TASK },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export interface TicketFormUser {
  id: string;
  email: string;
  name: string | null;
  role?: string;
}

export interface TicketFormGroup {
  id: string;
  name: string;
  description: string | null;
}

interface TicketFormProps {
  isAgent?: boolean;
  currentUserId?: string;
  agents?: TicketFormUser[];
  groups?: TicketFormGroup[];
}

export function TicketForm({
  isAgent = false,
  currentUserId,
  agents = [],
  groups = [],
}: TicketFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const agentOptions = [
    { value: "", label: "Unassigned" },
    { value: "myself", label: "Myself" },
    ...agents.map((a) => ({ value: a.id, label: a.name || a.email })),
  ];

  const groupOptions = [
    { value: "", label: "No Group" },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "BUG",
      priority: "MEDIUM",
      assignedToId: isAgent && agents.length > 0 ? "myself" : "",
      assignedToGroupId: "",
    },
  });

  const onSubmit = async (data: CreateTicketInput) => {
    setServerError(null);
    try {
      const assignedToId =
        data.assignedToId === "myself"
          ? currentUserId ?? undefined
          : (data.assignedToId || undefined);
      const description = (data.description || "").trim() || undefined;
      const descriptionPlain = description ? stripHtml(description) : undefined;

      await api.post<{ id: string; ticket_number: string }>("/tickets", {
        title: data.title.trim(),
        description,
        description_plain: descriptionPlain,
        type: data.type,
        priority: data.priority,
        assigned_to_id: assignedToId,
        assigned_to_group_id: data.assignedToGroupId || undefined,
      });
      navigate(`${ROUTES.DASHBOARD}/tickets`);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create ticket. Please try again.";
      setServerError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">
              {serverError}
            </p>
          </div>
        </div>
      )}

      <Input
        label="Ticket Title"
        type="text"
        placeholder="Brief description of your issue or request"
        error={errors.title?.message}
        helperText="A clear, concise title helps us understand your request quickly"
        required
        {...register("title")}
      />

      <Controller
        name="description"
        control={control}
        render={() => (
          <RichTextEditor
            label="Description"
            placeholder="Provide detailed information about your issue, request, or question..."
            error={errors.description?.message}
            helperText="Include any relevant details, steps to reproduce, or context that would help us assist you"
            value={watch("description") || ""}
            onChange={(html) => setValue("description", html, { shouldValidate: true })}
            minHeight="200px"
            showToolbar
          />
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Select
          label="Ticket Type"
          options={TICKET_TYPE_OPTIONS}
          placeholder="Select ticket type"
          error={errors.type?.message}
          helperText="Choose the category that best fits your request"
          required
          {...register("type")}
        />
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          placeholder="Select priority"
          error={errors.priority?.message}
          helperText="How urgent is this request?"
          required
          {...register("priority")}
        />
      </div>

      {isAgent && (agents.length > 0 || groups.length > 0) && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {agents.length > 0 && (
              <Select
                label="Assign To"
                options={agentOptions}
                placeholder="Select agent"
                error={errors.assignedToId?.message}
                helperText="Assign this ticket to an agent (or leave unassigned)"
                {...register("assignedToId")}
              />
            )}
            {groups.length > 0 && (
              <Select
                label="Assign To Group"
                options={groupOptions}
                placeholder="Select group"
                error={errors.assignedToGroupId?.message}
                helperText="Assign this ticket to a group"
                {...register("assignedToGroupId")}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(`${ROUTES.DASHBOARD}/tickets`)}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? "Creating Ticket..." : "Create Ticket"}
        </Button>
      </div>
    </form>
  );
}
