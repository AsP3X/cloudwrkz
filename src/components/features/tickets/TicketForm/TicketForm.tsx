"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTicketSchema, type CreateTicketInput } from "@/lib/validations/tickets";
import { createTicket } from "@/server/actions/tickets";
import { ROUTES } from "@/lib/constants/routes";
import { TICKET_TYPE_LABELS, type TicketType } from "@/lib/utils/tickets";

const TICKET_TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
  { value: "SUPPORT", label: TICKET_TYPE_LABELS.SUPPORT },
  { value: "BUG", label: TICKET_TYPE_LABELS.BUG },
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

interface TicketFormProps {
  isAgent?: boolean;
  users?: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
  agents?: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
  }>;
}

export const TicketForm = ({ isAgent = false, users = [], agents = [] }: TicketFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const userOptions = [
    { value: "", label: "Myself" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const agentOptions = [
    { value: "", label: "Unassigned" },
    { value: "myself", label: "Myself" },
    ...agents.map((agent) => ({
      value: agent.id,
      label: agent.name || agent.email,
    })),
  ];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      type: "SUPPORT",
      priority: "MEDIUM",
      createdForUserId: "",
      assignedToId: "",
    },
  });

  const onSubmit = async (data: CreateTicketInput) => {
    setServerError(null);

    try {
      // Handle "myself" for assignedToId - will be resolved on server
      const assignedToId = data.assignedToId === "myself" ? "myself" : (data.assignedToId || undefined);

      const result = await createTicket({
        title: data.title,
        description: data.description || undefined,
        type: data.type,
        priority: data.priority,
        createdForUserId: data.createdForUserId || undefined,
        assignedToId,
      });

      if (result.success && result.data) {
        // Redirect to the tickets list page
        router.push(`${ROUTES.DASHBOARD}/tickets`);
        router.refresh();
      } else if (!result.success) {
        // Handle field-specific errors
        if (result.fieldErrors) {
          // Field errors are handled by react-hook-form via zod
          setServerError(
            Object.values(result.fieldErrors).flat().join(", ") ||
              result.error ||
              "Failed to create ticket. Please check your input and try again."
          );
        } else {
          setServerError(result.error || "Failed to create ticket. Please try again.");
        }
      }
    } catch (error) {
      console.error("Ticket creation error:", error);
      setServerError("An unexpected error occurred. Please try again.");
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <form
      method="POST"
      action="#"
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
        placeholder="Brief description of your issue or request"
        error={errors.title?.message}
        helperText="A clear, concise title helps us understand your request quickly"
        required
        {...register("title")}
      />

      {/* Description Field */}
      <Textarea
        label="Description"
        placeholder="Provide detailed information about your issue, request, or question..."
        error={errors.description?.message}
        helperText="Include any relevant details, steps to reproduce, or context that would help us assist you"
        rows={8}
        {...register("description")}
      />

      {/* Type and Priority Row */}
      <div className={`grid grid-cols-1 ${isAgent ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-6`}>
        {/* Type Field */}
        <Select
          label="Ticket Type"
          options={TICKET_TYPE_OPTIONS}
          placeholder="Select ticket type"
          error={errors.type?.message}
          helperText="Choose the category that best fits your request"
          required
          {...register("type")}
        />

        {/* Priority Field */}
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

      {/* Agent-specific fields */}
      {isAgent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Created For User (Agents only) */}
          {users.length > 0 && (
            <Select
              label="Create For"
              options={userOptions}
              placeholder="Select user"
              error={errors.createdForUserId?.message}
              helperText="Create ticket for yourself or another user"
              {...register("createdForUserId")}
            />
          )}

          {/* Assigned Agent (Agents only) */}
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
        </div>
      )}

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
          {isSubmitting ? "Creating Ticket..." : "Create Ticket"}
        </Button>
      </div>
    </form>
  );
};
