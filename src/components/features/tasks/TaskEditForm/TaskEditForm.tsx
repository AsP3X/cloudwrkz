"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/Button";
import { updateTodoSchema, type UpdateTodoInput } from "@/lib/validations/todos";
import { updateTodo } from "@/server/actions/todos";

interface TaskEditFormProps {
  task: {
    id: string;
    title: string;
    description: string | null;
  };
}

export const TaskEditForm = ({ task }: TaskEditFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<UpdateTodoInput>({
    resolver: zodResolver(updateTodoSchema),
    defaultValues: {
      title: task.title,
      description: (task as any).descriptionHtml || task.description || "",
    },
  });

  const onSubmit = async (data: UpdateTodoInput) => {
    setServerError(null);

    try {
      const result = await updateTodo(
        task.id,
        {
          title: data.title,
          description: data.description || undefined,
        }
      );

      if (result.success) {
        router.push(`/dashboard/todos/${task.id}`);
        router.refresh();
      } else if (!result.success) {
        if (result.fieldErrors) {
          setServerError(
            Object.values(result.fieldErrors).flat().join(", ") ||
              result.error ||
              "Failed to update task. Please check your input and try again."
          );
        } else {
          setServerError(result.error || "Failed to update task. Please try again.");
        }
      }
    } catch (error) {
      console.error("Task update error:", error);
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
          onImageUpload={async (file) => {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/todos/upload-image", {
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
          {isSubmitting ? "Updating Task..." : "Update Task"}
        </Button>
      </div>
    </form>
  );
};
