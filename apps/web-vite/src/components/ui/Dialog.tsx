import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  /**
   * Use when opening a second dialog on top of another (e.g. picker inside edit).
   * Raises backdrop + panel z-index so the overlay stacks above the parent dialog.
   */
  nested?: boolean;
  /**
   * When false, Escape does not call onOpenChange(false). Use while a nested overlay
   * is open so the parent dialog does not dismiss before the child handles Escape.
   */
  closeOnEscape?: boolean;
  /**
   * When false, backdrop and outside-panel clicks do not dismiss. Use for forms where
   * accidental outside clicks should not lose in-progress work.
   */
  closeOnOutsideClick?: boolean;
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
      nested = false,
      closeOnEscape = true,
      closeOnOutsideClick = true,
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

    // Human: Escape dismisses the dialog unless the parent opted out (e.g. nested picker is open).
    // Agent: READS open, closeOnEscape, onOpenChange; LISTENS document keydown Escape; CALLS onOpenChange(false).
    React.useEffect(() => {
      if (!open) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && closeOnEscape) {
          onOpenChange?.(false);
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [open, onOpenChange, closeOnEscape]);

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
        {/* Human: Nested dialogs use a stronger blur so the parent panel reads clearly beneath the overlay picker. */}
        {/* Agent: backdrop-blur-sm default; backdrop-blur-md when nested; z-index stacks above parent dialog. */}
        <div
          role="presentation"
          className={cn(
            "fixed inset-0 bg-black/40 animate-dialog-backdrop",
            nested ? "z-[100] backdrop-blur-md" : "z-[40] backdrop-blur-sm",
          )}
          onClick={() => {
            if (closeOnOutsideClick) {
              onOpenChange?.(false);
            }
          }}
        />

        {/* Dialog */}
        <div
          role="presentation"
          className={cn(
            "fixed inset-0 flex items-center justify-center px-4 py-4 sm:px-6 sm:py-6 overflow-x-hidden sm:overflow-x-auto",
            nested ? "z-[110]" : "z-50"
          )}
          onClick={(e) => {
            if (closeOnOutsideClick && e.target === e.currentTarget) {
              onOpenChange?.(false);
            }
          }}
        >
          <div
            ref={internalRef}
            className={cn(
              "bg-white dark:bg-neutral-900",
              "rounded-2xl",
              "border border-neutral-200/80 dark:border-neutral-700/60",
              "shadow-[0_25px_60px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-12px_rgba(0,0,0,0.4)]",
              "w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden overflow-x-hidden",
              "animate-dialog-panel relative",
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
              <div className="relative">
                <div className="px-5 sm:px-7 py-5 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {title && (
                      <h2
                        id="dialog-title"
                        className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
                      >
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenChange?.(false)}
                    className="group -mt-0.5 p-2 rounded-lg text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all duration-200 active:scale-95"
                    aria-label="Close dialog"
                  >
                    <svg
                      className="w-4.5 h-4.5 transition-transform duration-200 group-hover:rotate-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="h-px bg-gradient-to-r from-primary-500/30 via-primary-400/10 to-transparent animate-accent-line" />
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto overflow-x-hidden max-h-[calc(90vh-120px)] scrollbar-thin">
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
