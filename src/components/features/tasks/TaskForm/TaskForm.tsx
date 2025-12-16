"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validations/tasks";
import { createTask } from "@/server/actions/tasks";
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

interface TaskFormProps {
  users?: Array<{
    id: string;
    email: string;
    name: string | null;
  }>;
  tickets?: Array<{
    id: string;
    ticketNumber: string;
    title: string;
  }>;
}

export const TaskForm = ({ users = [], tickets = [] }: TaskFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const userOptions = [
    { value: "", label: "Unassigned" },
    ...users.map((user) => ({
      value: user.id,
      label: user.name || user.email,
    })),
  ];

  const ticketOptions = [
    { value: "", label: "No Ticket" },
    ...tickets.map((ticket) => ({
      value: ticket.id,
      label: `${ticket.ticketNumber} - ${ticket.title}`,
    })),
  ];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
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

  const onSubmit = async (data: CreateTaskInput) => {
    setServerError(null);

    try {
      // Parse dates safely
      let startDate: Date | undefined;
      let dueDate: Date | undefined;
      
      if (data.startDate && data.startDate.trim() !== "") {
        const parsed = new Date(data.startDate);
        if (!isNaN(parsed.getTime())) {
          startDate = parsed;
        }
      }
      
      if (data.dueDate && data.dueDate.trim() !== "") {
        const parsed = new Date(data.dueDate);
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed;
        }
      }

      const result = await createTask({
        title: data.title,
        description: data.description || undefined,
        status: data.status as "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED",
        priority: data.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        assignedToId: data.assignedToId && data.assignedToId !== "" ? data.assignedToId : undefined,
        estimatedHours: data.estimatedHours,
        startDate,
        dueDate,
        ticketId: data.ticketId && data.ticketId !== "" ? data.ticketId : undefined,
      });

      if (result.success && result.data) {
        // Redirect to the tasks list page
        router.push(`${ROUTES.DASHBOARD}/tasks`);
        router.refresh();
      } else if (!result.success) {
        // Handle field-specific errors
        if (result.fieldErrors) {
          // Field errors are handled by react-hook-form via zod
          setServerError(
            Object.values(result.fieldErrors).flat().join(", ") ||
              result.error ||
              "Failed to create task. Please check your input and try again."
          );
        } else {
          // Log the full error for debugging
          console.error("Task creation failed:", result.error);
          setServerError(result.error || "Failed to create task. Please try again.");
        }
      }
    } catch (error) {
      console.error("Task creation error:", error);
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
            <p className="text-sm font-medium text-error-800 dark:text-error-200 break-words">{serverError}</p>
          </div>
        </div>
      )}

      {/* Title Field */}
      <Input
        label="Task Title"
        type="text"
        placeholder="Brief description of the task"
        error={errors.title?.message}
        helperText="A clear, concise title helps identify the task quickly"
        required
        {...register("title")}
      />

      {/* Description Field */}
      <div>
        <RichTextEditor
          label="Description"
          placeholder="Provide detailed information about the task..."
          error={errors.description?.message}
          helperText="Include any relevant details, requirements, or context"
          value={watch("description") || ""}
          onChange={(html) => {
            setValue("description", html, { shouldValidate: true });
          }}
          name="description"
        />
      </div>

      {/* Status and Priority Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Field */}
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          placeholder="Select status"
          error={errors.status?.message}
          helperText="Current status of the task"
          required
          {...register("status")}
        />

        {/* Priority Field */}
        <Select
          label="Priority"
          options={PRIORITY_OPTIONS}
          placeholder="Select priority"
          error={errors.priority?.message}
          helperText="How urgent is this task?"
          required
          {...register("priority")}
        />
      </div>

      {/* Assigned To and Ticket Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assigned To Field */}
        {users.length > 0 && (
          <Select
            label="Assign To"
            options={userOptions}
            placeholder="Select user"
            error={errors.assignedToId?.message}
            helperText="Assign this task to a user (optional)"
            {...register("assignedToId")}
          />
        )}

        {/* Ticket Field */}
        {tickets.length > 0 && (
          <Select
            label="Link to Ticket"
            options={ticketOptions}
            placeholder="Select ticket"
            error={errors.ticketId?.message}
            helperText="Link this task to a ticket (optional)"
            {...register("ticketId")}
          />
        )}
      </div>

      {/* Estimated Hours, Start Date, and Due Date Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Estimated Hours Field */}
        <Input
          label="Estimated Hours"
          type="number"
          placeholder="0"
          step="0.1"
          min="0"
          error={errors.estimatedHours?.message}
          helperText="Estimated time to complete (optional)"
          {...register("estimatedHours")}
        />

        {/* Start Date Field */}
        <Input
          label="Start Date"
          type="date"
          error={errors.startDate?.message}
          helperText="When to start the task (optional)"
          {...register("startDate")}
        />

        {/* Due Date Field */}
        <Input
          label="Due Date"
          type="date"
          error={errors.dueDate?.message}
          helperText="When the task is due (optional)"
          {...register("dueDate")}
        />
      </div>

      {/* Submit Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? "Creating Task..." : "Create Task"}
        </Button>
      </div>
    </form>
  );
};
