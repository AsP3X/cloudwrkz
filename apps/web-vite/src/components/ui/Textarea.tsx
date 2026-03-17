import React from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = React.useMemo(() => {
      if (id) return id;
      if (props.name) return `textarea-${props.name}`;
      return undefined;
    }, [id, props.name]);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            {label}
            {props.required && (
              <span className="text-error-500 dark:text-error-400 ml-1">*</span>
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "w-full px-4 py-3 rounded-lg border-2 transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900",
            "disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:cursor-not-allowed",
            "placeholder:text-neutral-400 dark:placeholder:text-neutral-500 resize-y min-h-[100px]",
            error
              ? "border-error-300 dark:border-error-700 bg-error-50 dark:bg-error-900/20 focus:border-error-500 dark:focus:border-error-500 focus:ring-error-500"
              : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-primary-500 dark:focus:border-primary-500 text-neutral-900 dark:text-neutral-100",
            className
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          {...props}
        />
        {error && (
          <p
            id={`${textareaId}-error`}
            className="mt-2 text-sm text-error-600 dark:text-error-400 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
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
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            id={`${textareaId}-helper`}
            className="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
