import React from "react";
import { cn } from "@/lib/utils/cn";
import type { TextareaProps } from "./Textarea.types";

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
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    
    // Combine refs
    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);
    
    // Ensure dark mode background is applied correctly
    React.useEffect(() => {
      if (!textareaRef.current) return;
      
      const updateBackground = () => {
        if (!textareaRef.current || error) {
          // Remove inline style for error states
          if (textareaRef.current) {
            textareaRef.current.style.removeProperty("background-color");
          }
          return;
        }
        
        const isDark = document.documentElement.classList.contains("dark");
        if (isDark) {
          // Apply dark mode background
          textareaRef.current.style.setProperty("background-color", "rgb(38 38 38)", "important");
        } else {
          // Remove inline style to let CSS handle light mode
          textareaRef.current.style.removeProperty("background-color");
        }
      };
      
      // Initial update with multiple strategies to catch late-applied dark class
      const applyBackground = () => {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          updateBackground();
          // Also try after a microtask
          setTimeout(updateBackground, 0);
        });
      };
      
      applyBackground();
      const timeout1 = setTimeout(applyBackground, 50);
      const timeout2 = setTimeout(applyBackground, 100);
      const timeout3 = setTimeout(applyBackground, 200);
      const timeout4 = setTimeout(applyBackground, 500);
      
      // Watch for theme changes
      const observer = new MutationObserver(() => {
        updateBackground();
        // Also retry after a short delay when class changes
        setTimeout(updateBackground, 10);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      
      // Also listen for when the page becomes visible (after navigation)
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          setTimeout(updateBackground, 0);
          setTimeout(updateBackground, 50);
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
        clearTimeout(timeout3);
        clearTimeout(timeout4);
        observer.disconnect();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }, [error]);
    
    // Aggressive check for client-side navigation - continuously check for first second
    React.useEffect(() => {
      if (!textareaRef.current || error) return;
      
      let intervalId: NodeJS.Timeout | null = null;
      let checkCount = 0;
      const maxChecks = 20; // Check 20 times over 1 second
      
      const checkAndApply = () => {
        if (!textareaRef.current || error || checkCount >= maxChecks) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          return;
        }
        
        checkCount++;
        const isDark = document.documentElement.classList.contains("dark");
        if (isDark && textareaRef.current) {
          textareaRef.current.style.setProperty("background-color", "rgb(38 38 38)", "important");
        }
      };
      
      // Start checking immediately and then every 50ms
      checkAndApply();
      intervalId = setInterval(checkAndApply, 50);
      
      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }, [error]);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            {label}
            {props.required && <span className="text-error-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={textareaRef}
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
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
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
