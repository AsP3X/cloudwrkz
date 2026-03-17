import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  (
    {
      open,
      onOpenChange,
      children,
      title,
      description,
      className,
      ...props
    },
    ref
  ) => {
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    const internalRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        dialogRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref]
    );

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

    // Focus trap
    React.useEffect(() => {
      if (!open || !dialogRef.current) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;

        const container = dialogRef.current;
        if (!container) return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement;

        if (e.shiftKey) {
          if (active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open]);

    // Focus first focusable on open
    React.useEffect(() => {
      if (open && dialogRef.current) {
        const firstInput = dialogRef.current.querySelector(
          "input, select, textarea, button"
        ) as HTMLElement;
        firstInput?.focus();
      }
    }, [open]);

    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
      if (typeof document !== "undefined" && document.body) {
        setMounted(true);
      }
    }, []);

    if (!open) return null;

    const dialogContent = (
      <>
        {/* Backdrop */}
        <div
          role="presentation"
          className="fixed inset-0 bg-black/50 animate-fade-in z-[40]"
          onClick={() => onOpenChange?.(false)}
        />

        {/* Dialog */}
        <div
          role="presentation"
          className="fixed inset-0 flex items-center justify-center px-4 py-4 sm:px-6 sm:py-6 overflow-x-hidden sm:overflow-x-auto z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onOpenChange?.(false);
            }
          }}
        >
          <div
            ref={internalRef}
            className={cn(
              "bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800",
              "shadow-soft-xl",
              "w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden overflow-x-hidden",
              "animate-slide-in relative",
              className
            )}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "dialog-title" : undefined}
            {...props}
          >
            {/* Header */}
            {(title || description) && (
              <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2
                      id="dialog-title"
                      className="text-xl font-bold text-neutral-900 dark:text-neutral-100 break-words"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 break-words">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onOpenChange?.(false)}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
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
            <div className="overflow-y-auto overflow-x-hidden max-h-[calc(90vh-120px)]">
              {children}
            </div>
          </div>
        </div>
      </>
    );

    if (!mounted || typeof document === "undefined" || !document.body) {
      return null;
    }

    return createPortal(dialogContent, document.body);
  }
);

Dialog.displayName = "Dialog";
