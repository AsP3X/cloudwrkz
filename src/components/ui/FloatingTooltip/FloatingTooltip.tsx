"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface FloatingTooltipProps {
  /** The trigger element (button, icon, etc.) */
  trigger: React.ReactNode;
  /** The content to display in the tooltip */
  children: React.ReactNode;
  /** Whether the tooltip is open */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Position of the tooltip relative to trigger */
  position?: "top" | "bottom" | "left" | "right" | "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /** Additional className for the tooltip container */
  className?: string;
  /** Additional className for the tooltip content */
  contentClassName?: string;
}

export const FloatingTooltip: React.FC<FloatingTooltipProps> = ({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  position = "bottom",
  className,
  contentClassName,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ top: number; left: number } | null>(null);

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  // Calculate tooltip position
  React.useEffect(() => {
    if (!isOpen || !triggerRef.current || !tooltipRef.current) {
      setTooltipPosition(null);
      return;
    }

    // Use requestAnimationFrame to ensure DOM is updated before calculating position
    const calculatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current || typeof window === "undefined") return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      const gap = 8; // Gap between trigger and tooltip

      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = triggerRect.top + scrollY - tooltipRect.height - gap;
          left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case "bottom":
          top = triggerRect.bottom + scrollY + gap;
          left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
          break;
        case "left":
          top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.left + scrollX - tooltipRect.width - gap;
          break;
        case "right":
          top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
          left = triggerRect.right + scrollX + gap;
          break;
        case "top-right":
          top = triggerRect.top + scrollY - tooltipRect.height - gap;
          left = triggerRect.right + scrollX - tooltipRect.width;
          break;
        case "top-left":
          top = triggerRect.top + scrollY - tooltipRect.height - gap;
          left = triggerRect.left + scrollX;
          break;
        case "bottom-right":
          top = triggerRect.bottom + scrollY + gap;
          left = triggerRect.right + scrollX - tooltipRect.width;
          break;
        case "bottom-left":
          top = triggerRect.bottom + scrollY + gap;
          left = triggerRect.left + scrollX;
          break;
      }

      // Keep tooltip within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < scrollX + 8) {
        left = scrollX + 8;
      } else if (left + tooltipRect.width > scrollX + viewportWidth - 8) {
        left = scrollX + viewportWidth - tooltipRect.width - 8;
      }

      if (top < scrollY + 8) {
        top = scrollY + 8;
      } else if (top + tooltipRect.height > scrollY + viewportHeight - 8) {
        top = scrollY + viewportHeight - tooltipRect.height - 8;
      }

      setTooltipPosition({ top, left });
    };

    // Calculate position after DOM update
    requestAnimationFrame(() => {
      requestAnimationFrame(calculatePosition);
    });
  }, [isOpen, position, setIsOpen]);

  // Handle click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        tooltipRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    // Use setTimeout to avoid immediate closure on the click that opened it
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const timeoutId = setTimeout(() => {
      if (typeof document !== "undefined") {
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
      }
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      }
    };
  }, [isOpen]);

  // Handle scroll and resize
  React.useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const handleScrollOrResize = () => {
      // Recalculate position on scroll/resize
      if (triggerRef.current && tooltipRef.current && typeof window !== "undefined") {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        const gap = 8;

        let top = 0;
        let left = 0;

        switch (position) {
          case "top":
            top = triggerRect.top + scrollY - tooltipRect.height - gap;
            left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
            break;
          case "bottom":
            top = triggerRect.bottom + scrollY + gap;
            left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2;
            break;
          case "right":
            top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
            left = triggerRect.right + scrollX + gap;
            break;
          case "left":
            top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2;
            left = triggerRect.left + scrollX - tooltipRect.width - gap;
            break;
          case "top-right":
            top = triggerRect.top + scrollY - tooltipRect.height - gap;
            left = triggerRect.right + scrollX - tooltipRect.width;
            break;
          case "top-left":
            top = triggerRect.top + scrollY - tooltipRect.height - gap;
            left = triggerRect.left + scrollX;
            break;
          case "bottom-right":
            top = triggerRect.bottom + scrollY + gap;
            left = triggerRect.right + scrollX - tooltipRect.width;
            break;
          case "bottom-left":
            top = triggerRect.bottom + scrollY + gap;
            left = triggerRect.left + scrollX;
            break;
        }

        // Keep within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left < scrollX + 8) left = scrollX + 8;
        if (left + tooltipRect.width > scrollX + viewportWidth - 8) {
          left = scrollX + viewportWidth - tooltipRect.width - 8;
        }
        if (top < scrollY + 8) top = scrollY + 8;
        if (top + tooltipRect.height > scrollY + viewportHeight - 8) {
          top = scrollY + viewportHeight - tooltipRect.height - 8;
        }

        setTooltipPosition({ top, left });
      }
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
      }
    };
  }, [isOpen, position]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      {/* Trigger */}
      <div ref={triggerRef} onClick={handleTriggerClick} className="cursor-pointer">
        {trigger}
      </div>

      {/* Tooltip */}
      {isOpen && (
        <>
          {/* Backdrop for mobile/click outside */}
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          
          {/* Tooltip content */}
          <div
            ref={tooltipRef}
            className={cn(
              "fixed z-50 bg-white dark:bg-neutral-900 rounded-xl shadow-soft-xl border border-neutral-200 dark:border-neutral-800",
              "animate-fade-in",
              "max-w-sm sm:max-w-md",
              contentClassName
            )}
            style={
              tooltipPosition
                ? {
                    top: `${tooltipPosition.top}px`,
                    left: `${tooltipPosition.left}px`,
                  }
                : { visibility: "hidden" }
            }
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
};
