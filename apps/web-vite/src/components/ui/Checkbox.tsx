import React from "react";
import { cn } from "@/lib/utils/cn";

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
};

const iconSizes = {
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
};

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  className?: string;
  checked?: boolean;
  indeterminate?: boolean;
  size?: "sm" | "md";
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      checked = false,
      indeterminate = false,
      size = "md",
      disabled,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
          el;
        if (typeof ref === "function") ref(el);
        else if (ref)
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      },
      [ref]
    );

    React.useEffect(() => {
      const input = inputRef.current;
      if (input) input.indeterminate = indeterminate;
    }, [indeterminate]);

    const showCheck = checked && !indeterminate;
    const showIndeterminate = checked && indeterminate;

    return (
      <label
        className={cn(
          "inline-flex items-center justify-center cursor-pointer select-none",
          disabled && "cursor-not-allowed opacity-60 pointer-events-none",
          className
        )}
      >
        <input
          ref={setRefs}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          className="sr-only peer"
          {...props}
        />
        <span
          className={cn(
            "inline-flex items-center justify-center flex-shrink-0 rounded-md border-2 transition-all duration-200",
            sizeClasses[size],
            !checked &&
              "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600",
            checked &&
              "border-transparent bg-primary-600 dark:bg-primary-500 text-white",
            !disabled &&
              !checked &&
              "hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
            !disabled &&
              checked &&
              "hover:bg-primary-700 dark:hover:bg-primary-600",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-neutral-900"
          )}
          aria-hidden
        >
          {showCheck && (
            <svg
              className={cn("text-white", iconSizes[size])}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5L19 7" />
            </svg>
          )}
          {showIndeterminate && (
            <svg
              className={cn("text-white", iconSizes[size])}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
            </svg>
          )}
        </span>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
