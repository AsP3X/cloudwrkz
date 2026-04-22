// Human: Hybrid tooltip/popover: supports controlled or internal open state, click or hover triggers, fixed positioning with viewport clamping, and a full-screen transparent scrim for click mode.
// Agent: STATE/CALLBACK open via controlledOpen; POSITION from triggerRect + scroll; LISTENS scroll/resize, mousedown outside, Escape when open.
import React from "react";
import { cn } from "@/lib/utils/cn";

export interface FloatingTooltipProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  position?: "top" | "bottom" | "left" | "right" | "top-right" | "top-left" | "bottom-right" | "bottom-left";
  triggerMode?: "click" | "hover";
  className?: string;
  contentClassName?: string;
}

export const FloatingTooltip: React.FC<FloatingTooltipProps> = ({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  position = "bottom",
  triggerMode = "click",
  className,
  contentClassName,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ top: number; left: number } | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = React.useCallback((value: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  }, [controlledOpen, onOpenChange]);

  React.useEffect(() => {
    if (!isOpen || !triggerRef.current || !tooltipRef.current) {
      setTooltipPosition(null);
      return;
    }

    const calculatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;

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

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (left < scrollX + 8) left = scrollX + 8;
      else if (left + tooltipRect.width > scrollX + viewportWidth - 8) {
        left = scrollX + viewportWidth - tooltipRect.width - 8;
      }

      if (top < scrollY + 8) top = scrollY + 8;
      else if (top + tooltipRect.height > scrollY + viewportHeight - 8) {
        top = scrollY + viewportHeight - tooltipRect.height - 8;
      }

      setTooltipPosition({ top, left });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(calculatePosition);
    });
  }, [isOpen, position, setIsOpen]);

  React.useEffect(() => {
    if (!isOpen || triggerMode !== "click") return;

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

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, triggerMode, setIsOpen]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      if (triggerRef.current && tooltipRef.current) {
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
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, position]);

  const handleMouseEnter = () => {
    if (triggerMode === "hover") setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (triggerMode === "hover") setIsOpen(false);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (triggerMode !== "click") return;
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onKeyDown={triggerMode === "click" ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); } } : undefined}
        onClick={triggerMode === "click" ? handleTriggerClick : undefined}
        onMouseEnter={triggerMode === "hover" ? handleMouseEnter : undefined}
        onMouseLeave={triggerMode === "hover" ? handleMouseLeave : undefined}
        onFocus={triggerMode === "hover" ? handleMouseEnter : undefined}
        onBlur={triggerMode === "hover" ? handleMouseLeave : undefined}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen && (
        <>
          {triggerMode === "click" && (
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />
          )}
          
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
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
};
