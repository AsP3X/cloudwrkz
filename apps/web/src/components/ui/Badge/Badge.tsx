import React from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md" | "lg";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    const variants = {
      default: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
      success: "bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-300",
      warning: "bg-warning-100 dark:bg-warning-900 text-warning-700 dark:text-warning-300",
      error: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300",
      info: "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300",
    };

    const sizes = {
      sm: "px-2 py-0.5 text-xs",
      md: "px-2.5 py-1 text-sm",
      lg: "px-3 py-1.5 text-base",
    };

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center font-medium rounded-md",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
