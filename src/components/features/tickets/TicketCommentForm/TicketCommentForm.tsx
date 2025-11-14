"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { z } from "zod";
import { addTicketComment } from "@/server/actions/tickets";

const commentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment must be less than 5000 characters")
    .trim(),
});

type CommentInput = z.infer<typeof commentSchema>;

interface TicketCommentFormProps {
  ticketId: string;
}

export const TicketCommentForm = ({ ticketId }: TicketCommentFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CommentInput>({
    resolver: zodResolver(commentSchema),
  });

  const onSubmit = async (data: CommentInput) => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      const result = await addTicketComment(ticketId, data.content);

      if (result.success) {
        reset();
        router.refresh();
      } else {
        setServerError(result.error || "Failed to add comment. Please try again.");
      }
    } catch (error) {
      console.error("Comment submission error:", error);
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
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

      <Textarea
        label="Add a comment"
        placeholder="Write your comment here..."
        error={errors.content?.message}
        rows={4}
        {...register("content")}
      />

      <div className="flex items-center justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </form>
  );
};
