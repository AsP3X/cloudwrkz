"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import type { DialogProps } from "./Dialog.types";

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ open, onOpenChange, children, title, description, className, ...props }, ref) => {
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    const internalRef = React.useCallback((node: HTMLDivElement | null) => {
      dialogRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        // Type assertion needed for readonly refs in forwardRef
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ref as any).current = node;
      }
    }, [ref]);

    // Handle escape key
    React.useEffect(() => {
      if (!open) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onOpenChange?.(false);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [open, onOpenChange]);

    // Focus management
    React.useEffect(() => {
      if (open && dialogRef.current) {
        const firstInput = dialogRef.current.querySelector("input, select, textarea, button") as HTMLElement;
        firstInput?.focus();
      }
    }, [open]);

    if (!open) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
          onClick={() => onOpenChange?.(false)}
        />
        
        {/* Dialog */}
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            // Close when clicking backdrop
            if (e.target === e.currentTarget) {
              onOpenChange?.(false);
            }
          }}
        >
          <div
            ref={internalRef}
            className={cn(
              "bg-white rounded-xl shadow-soft-xl border border-neutral-200",
              "w-full max-w-2xl max-h-[90vh] overflow-hidden",
              "animate-slide-in",
              className
            )}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "dialog-title" : undefined}
            {...props}
          >
            {/* Header */}
            {(title || description) && (
              <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
                <div>
                  {title && (
                    <h2 id="dialog-title" className="text-xl font-bold text-neutral-900">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm text-neutral-600 mt-1">{description}</p>
                  )}
                </div>
                <button
                  onClick={() => onOpenChange?.(false)}
                  className="text-neutral-400 hover:text-neutral-600 transition-colors"
                  aria-label="Close dialog"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
              {children}
            </div>
          </div>
        </div>
      </>
    );
  }
);

Dialog.displayName = "Dialog";
