import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { sanitizeHtml } from "@/lib/utils/html-sanitizer";

const commentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(50000, "Comment is too long")
    .transform((html) => sanitizeHtml(html)),
  isAgentOnly: z.boolean().default(false),
});

type CommentInput = z.infer<typeof commentSchema>;

export interface TicketCommentFormProps {
  ticketId: string;
  userRole: string;
  onCommentAdded?: () => void;
  onStatusChange?: (status: string) => void;
}

export function TicketCommentForm({
  ticketId,
  userRole,
  onCommentAdded,
  onStatusChange,
}: TicketCommentFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const isAgent =
    userRole === "AGENT" || userRole === "ADMIN" || userRole === "MODERATOR";

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CommentInput>({
    resolver: zodResolver(commentSchema),
    defaultValues: { isAgentOnly: false },
  });

  const submitComment = async (
    data: CommentInput,
    status?: "OPEN" | "PENDING" | "RESOLVED"
  ) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await api.post<{ id: string }>(
        `/tickets/${ticketId}/comments`,
        { content: data.content, is_agent_only: data.isAgentOnly }
      );
      if (!res?.id) {
        setServerError("Failed to add comment. Please try again.");
        return;
      }
      if (status && onStatusChange) {
        try {
          await api.patch(`/tickets/${ticketId}`, { status });
          onStatusChange(status);
        } catch {
          setServerError("Comment posted but failed to update ticket status.");
          setIsSubmitting(false);
          return;
        }
      }
      reset();
      setIsDropdownOpen(false);
      onCommentAdded?.();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to add comment. Please try again.";
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = (data: CommentInput) => submitComment(data);

  const handleQuickAction = async (
    action: "post" | "pending" | "resolve" | "open"
  ) => {
    const content = getValues("content");
    const isAgentOnlyValue = getValues("isAgentOnly");
    if (!content || content.trim().length === 0) {
      setServerError("Comment cannot be empty");
      setIsDropdownOpen(false);
      return;
    }
    const data: CommentInput = {
      content: content.trim(),
      isAgentOnly: isAgentOnlyValue,
    };
    if (action === "post") await submitComment(data);
    else if (action === "pending") await submitComment(data, "PENDING");
    else if (action === "resolve") await submitComment(data, "RESOLVED");
    else if (action === "open") await submitComment(data, "OPEN");
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
    <form
      onSubmit={handleFormSubmit}
      className="space-y-4"
      noValidate
    >
      {serverError && (
        <div className="rounded-lg bg-error-50 dark:bg-error-900/20 border-2 border-error-200 dark:border-error-800 p-4">
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
            <p className="text-sm font-medium text-error-800 dark:text-error-300">
              {serverError}
            </p>
          </div>
        </div>
      )}

      <RichTextEditor
        label="Add a comment"
        placeholder="Write your comment here..."
        error={errors.content?.message}
        value={watch("content") || ""}
        onChange={(html) => setValue("content", html, { shouldValidate: true })}
        minHeight="150px"
        name="content"
      />

      {isAgent && (
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isAgentOnly"
            {...register("isAgentOnly")}
            className="w-4 h-4 text-primary-600 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 bg-white dark:bg-neutral-800"
          />
          <label
            htmlFor="isAgentOnly"
            className="ml-2 text-sm text-neutral-700 dark:text-neutral-300"
          >
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
              <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-neutral-800 ring-1 ring-black dark:ring-neutral-700 ring-opacity-5 z-10">
                <div className="py-1" role="menu" aria-orientation="vertical">
                  <button
                    type="button"
                    onClick={() => handleQuickAction("post")}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Post
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAction("pending")}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Set Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAction("resolve")}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    role="menuitem"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAction("open")}
                    disabled={isSubmitting}
                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
}
