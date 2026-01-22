"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { updateTicketSchema, type UpdateTicketInput } from "@/lib/validations/tickets";
import { updateTicket } from "@/server/actions/tickets";
import { TICKET_TYPE_LABELS, type TicketType } from "@/lib/utils/tickets";

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

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

interface TicketEditFormProps {
  ticket: {
    id: string;
    title: string;
    description: string | null;
    type: TicketType;
    priority: string;
    status: string;
    assignedToId: string | null;
    assignedToGroupId: string | null;
  };
  agents: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  groups?: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
}

export const TicketEditForm = ({ ticket, agents, groups = [] }: TicketEditFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const agentOptions = [
    { value: "", label: "Unassigned" },
    ...agents.map((agent) => ({
      value: agent.id,
      label: agent.name || agent.email,
    })),
  ];

  const groupOptions = [
    { value: "", label: "No Group" },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<UpdateTicketInput>({
    resolver: zodResolver(updateTicketSchema),
    defaultValues: {
      title: ticket.title,
      description: (ticket as any).descriptionHtml || ticket.description || "",
      type: ticket.type,
      priority: ticket.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      status: ticket.status as
        | "OPEN"
        | "IN_PROGRESS"
        | "PENDING"
        | "RESOLVED"
        | "CLOSED"
        | "CANCELLED",
      assignedToId: ticket.assignedToId || "",
      assignedToGroupId: ticket.assignedToGroupId || "",
    },
  });

  const onSubmit = async (data: UpdateTicketInput) => {
    setServerError(null);

    try {
      const result = await updateTicket(
        ticket.id,
        {
          title: data.title,
          description: data.description || undefined,
          type: data.type,
          priority: data.priority,
          status: data.status,
          assignedToId:
            data.assignedToId === "" || data.assignedToId === null
              ? null
              : (data.assignedToId || undefined),
          assignedToGroupId:
            data.assignedToGroupId === "" || data.assignedToGroupId === null
              ? null
              : (data.assignedToGroupId || undefined),
        } as Parameters<typeof updateTicket>[1]
      );

      if (result.success) {
        router.push(`/dashboard/tickets/${ticket.id}`);
        router.refresh();
      } else if (!result.success) {
        if (result.fieldErrors) {
          setServerError(
            Object.values(result.fieldErrors).flat().join(", ") ||
              result.error ||
              "Failed to update ticket. Please check your input and try again."
          );
        } else {
          setServerError(result.error || "Failed to update ticket. Please try again.");
        }
      }
    } catch (error) {
      console.error("Ticket update error:", error);
      setServerError("An unexpected error occurred. Please try again.");
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="space-y-6"
      noValidate
    >
      {/* Server Error Message */}
      {serverError && (
        <div className="rounded-lg bg-error-50 border-2 border-error-200 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 mt-0.5 flex-shrink-0"
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
            <p className="text-sm font-medium text-error-800">{serverError}</p>
          </div>
        </div>
      )}

      {/* Title Field */}
      <Input
        label="Ticket Title"
        type="text"
        placeholder="Brief description of the issue or request"
        error={errors.title?.message}
        helperText="A clear, concise title helps identify the ticket quickly"
        required
        {...register("title")}
      />

      {/* Description Field */}
      <div>
        <RichTextEditor
          label="Description"
          placeholder="Provide detailed information about the issue, request, or question..."
          error={errors.description?.message}
          helperText="Include any relevant details, steps to reproduce, or context"
          // eslint-disable-next-line react-hooks/incompatible-library
          value={watch("description") || ""}
          onChange={(html) => {
            setValue("description", html, { shouldValidate: true });
          }}
          onImageUpload={async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/tickets/upload-image", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error("Failed to upload image");
            }
            const data = await response.json();
            return data.url;
          }}
          name="description"
        />
      </div>

      {/* Type, Priority, and Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Type Field */}
        <Select
          label="Ticket Type"
          options={TICKET_TYPE_OPTIONS}
          placeholder="Select ticket type"
          error={errors.type?.message}
          helperText="Category"
          required
          {...register("type")}
        />

        {/* Priority Field */}
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          placeholder="Select priority"
          error={errors.priority?.message}
          helperText="Urgency level"
          required
          {...register("priority")}
        />

        {/* Status Field */}
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          placeholder="Select status"
          error={errors.status?.message}
          helperText="Current status"
          required
          {...register("status")}
        />
      </div>

      {/* Assigned Agent Field */}
      <Select
        label="Assigned Agent"
        options={agentOptions}
        placeholder="Select an agent"
        error={errors.assignedToId?.message}
        helperText="Assign this ticket to an agent, admin, or moderator"
        {...register("assignedToId")}
      />

      {/* Assigned Group Field */}
      <Controller
        name="assignedToGroupId"
        control={control}
        render={({ field }) => (
          <Select
            label="Assigned To Group"
            options={groupOptions}
            placeholder={groups.length > 0 ? "Select a group" : "No groups available"}
            error={errors.assignedToGroupId?.message}
            helperText={groups.length > 0
              ? "Assign this ticket to a group (only agents in the group can access it)"
              : "No groups available. Contact an administrator to create groups."}
            {...field}
            disabled={groups.length === 0}
          />
        )}
      />

      {/* Submit Buttons */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t border-neutral-200">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Updating Ticket..." : "Update Ticket"}
        </Button>
      </div>
    </form>
  );
};
