import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Controller } from "react-hook-form";
import type { Ticket } from "@/lib/types";
import { updateTicketSchema, type UpdateTicketInput } from "@/lib/validations/tickets";
import { TICKET_TYPE_LABELS, type TicketType } from "@/lib/utils/tickets";

const TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
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
const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function TicketEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [agents, setAgents] = useState<Array<{ id: string; email: string; name: string | null }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateTicketInput>({
    resolver: zodResolver(updateTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "BUG",
      priority: "MEDIUM",
      status: "OPEN",
      assignedToId: "",
      assignedToGroupId: "",
    },
  });

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<{ ticket: Ticket }>(`/tickets/${id}`),
      api.get<{ users?: Array<{ id: string; email: string; name: string | null }> }>("/admin/users").then((r) => r.users ?? []),
      api.get<{ groups?: Array<{ id: string; name: string; description: string | null }> }>("/admin/groups").then((r) => r.groups ?? []),
    ])
      .then(([ticketRes, agentList, groupList]) => {
        if (cancelled) return;
        const t = ticketRes.ticket;
        setTicket(t);
        setAgents(agentList as Array<{ id: string; email: string; name: string | null }>);
        setGroups(groupList as Array<{ id: string; name: string; description: string | null }>);
        reset({
          title: t.title,
          description: t.description_plain ?? t.description ?? "",
          type: (t.type || "BUG") as TicketType,
          priority: (t.priority || "MEDIUM") as UpdateTicketInput["priority"],
          status: (t.status || "OPEN") as UpdateTicketInput["status"],
          assignedToId: (t as { assigned_to_id?: string }).assigned_to_id ?? "",
          assignedToGroupId: (t as { assigned_to_group_id?: string }).assigned_to_group_id ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) setTicket(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  const onSubmit = async (data: UpdateTicketInput) => {
    if (!ticket) return;
    setError(null);
    try {
      await api.patch(`/tickets/${ticket.id}`, {
        title: data.title.trim(),
        description: (data.description || "").trim() || undefined,
        type: data.type,
        priority: data.priority,
        status: data.status,
        assigned_to_id: data.assignedToId && data.assignedToId !== "" ? data.assignedToId : null,
        assigned_to_group_id: data.assignedToGroupId && data.assignedToGroupId !== "" ? data.assignedToGroupId : null,
      });
      navigate(`${ROUTES.DASHBOARD}/tickets/${ticket.id}`);
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to update ticket.");
    }
  };

  if (user?.role !== "AGENT" && user?.role !== "ADMIN" && user?.role !== "MODERATOR") {
    navigate(ROUTES.DASHBOARD, { replace: true });
    return null;
  }

  if (loading || !ticket) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  const agentOptions = [
    { value: "", label: "Unassigned" },
    ...agents.map((a) => ({ value: a.id, label: a.name || a.email })),
  ];
  const groupOptions = [
    { value: "", label: "No Group" },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`${ROUTES.DASHBOARD}/tickets/${id}`}>
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Ticket
          </Button>
        </Link>
      </div>
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-lg font-mono font-semibold text-primary-600">{ticket.ticket_number}</span>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Edit Ticket</h1>
        </div>
        {error && (
          <div className="rounded-lg bg-error-50 dark:bg-error-950/50 border-2 border-error-200 dark:border-error-800 p-4 mb-4">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <Input label="Title" error={errors.title?.message} required {...register("title")} />
          <Controller
            name="description"
            control={control}
            render={({ field }) => <RichTextEditor label="Description" value={field.value || ""} onChange={field.onChange} />}
          />
          <Select label="Type" options={TYPE_OPTIONS} {...register("type")} />
          <Select label="Priority" options={PRIORITY_OPTIONS} {...register("priority")} />
          <Select label="Status" options={STATUS_OPTIONS} {...register("status")} />
          <Select label="Assigned To" options={agentOptions} {...register("assignedToId")} />
          <Select label="Assigned To Group" options={groupOptions} {...register("assignedToGroupId")} />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
              Save
            </Button>
            <Link to={`${ROUTES.DASHBOARD}/tickets/${ticket.id}`}>
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
