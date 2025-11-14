"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { z } from "zod";
import { addTicketComment, updateTicket } from "@/server/actions/tickets";

const commentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment must be less than 5000 characters")
    .trim(),
  isAgentOnly: z.boolean().default(false),
});

type CommentInput = z.infer<typeof commentSchema>;

interface TicketCommentFormProps {
  ticketId: string;
  userRole: string;
}

export const TicketCommentForm = ({ ticketId, userRole }: TicketCommentFormProps) => {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const isAgent = userRole === "AGENT" || userRole === "ADMIN" || userRole === "MODERATOR";

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<CommentInput>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      isAgentOnly: false,
    },
  });

  const submitComment = async (data: CommentInput, status?: "OPEN" | "PENDING" | "RESOLVED") => {
    setServerError(null);
    setIsSubmitting(true);

    try {
      // First, add the comment
      const commentResult = await addTicketComment(ticketId, data.content, data.isAgentOnly);

      if (!commentResult.success) {
        setServerError(commentResult.error || "Failed to add comment. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // If a status is provided, update the ticket status
      if (status) {
        const updateResult = await updateTicket(ticketId, { status });

        if (!updateResult.success) {
          setServerError(updateResult.error || "Comment posted but failed to update ticket status.");
          setIsSubmitting(false);
          return;
        }
      }

      reset();
      setIsDropdownOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Comment submission error:", error);
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: CommentInput) => {
    await submitComment(data);
  };

  const handleQuickAction = async (action: "post" | "pending" | "resolve" | "open") => {
    const content = getValues("content");
    const isAgentOnlyValue = getValues("isAgentOnly");

    if (!content || content.trim().length === 0) {
      setServerError("Comment cannot be empty");
      setIsDropdownOpen(false);
      return;
    }

    const data: CommentInput = { content: content.trim(), isAgentOnly: isAgentOnlyValue };

    if (action === "post") {
      await submitComment(data);
    } else if (action === "pending") {
      await submitComment(data, "PENDING");
    } else if (action === "resolve") {
      await submitComment(data, "RESOLVED");
    } else if (action === "open") {
      await submitComment(data, "OPEN");
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(onSubmit)(e);
  };

  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
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

      {isAgent && (
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isAgentOnly"
            {...register("isAgentOnly")}
            className="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500 focus:ring-2"
          />
          <label htmlFor="isAgentOnly" className="ml-2 text-sm text-neutral-700">
            Agent only comment
          </label>
        </div>
      )}

      <div className="flex items-center justify-end">
        {isAgent ? (
          <div className="relative inline-flex" ref={dropdownRef}>
            <div className="flex rounded-md shadow-sm">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                loading={isSubmitting}
                className="rounded-r-none border-r border-primary-700"
              >
                {isSubmitting ? "Posting..." : "Post"}
              </Button>
              <button
                type="button"
                onClick={handleDropdownToggle}
                disabled={isSubmitting}
                className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-primary-700 bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Quick actions"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                <div className="py-1" role="menu" aria-orientation="vertical">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleQuickAction("post");
                    }}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Post
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleQuickAction("pending");
                    }}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Set Pending
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleQuickAction("resolve");
                    }}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleQuickAction("open");
                    }}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Open
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? "Posting..." : "Post Comment"}
          </Button>
        )}
      </div>
    </form>
  );
};
