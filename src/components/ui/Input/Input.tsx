"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import type { InputProps } from "./Input.types";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
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
    // Use a deterministic, prop-based ID instead of React.useId
    // to avoid SSR/client hydration mismatches.
    const inputId = React.useMemo(() => {
      if (id) return id;
      if (props.name) return `input-${props.name}`;
      return undefined;
    }, [id, props.name]);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            {label}
            {props.required && <span className="text-error-500 dark:text-error-400 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full px-4 py-3 rounded-lg border-2 transition-all duration-200",
            // Base colors (light mode)
            "bg-white text-neutral-900 border-neutral-200",
            "placeholder:text-neutral-400",
            // Dark mode colors
            "dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800",
            "dark:placeholder:text-neutral-500",
            // Focus states
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
            "focus:border-primary-500",
            "dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400",
            // Hover states
            "hover:border-neutral-300 dark:hover:border-neutral-700",
            // Disabled states
            "disabled:bg-neutral-100 disabled:cursor-not-allowed",
            "dark:disabled:bg-neutral-800",
            // Error states
            error
              ? "border-error-300 bg-error-50 focus:border-error-500 focus:ring-error-500 dark:border-error-700 dark:bg-error-950 dark:focus:border-error-400 dark:focus:ring-error-400"
              : "",
            className
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
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
            id={`${inputId}-helper`}
            className="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
