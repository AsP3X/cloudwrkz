// Human: Fixed-position context menu portaled to `document.body`, clamped inside the viewport, and closed on outside click or Escape.
// Agent: useLayoutEffect READS ref rect; ADJUSTS left/top; createPortal to body; LISTENS click + keydown Escape; DEFERS item onClick via setTimeout(0) after close.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export interface OverviewContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  separatorAbove?: boolean;
  destructive?: boolean;
}

export interface OverviewContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: OverviewContextMenuItem[];
  className?: string;
}

const MENU_PADDING = 8;

export function OverviewContextMenu({
  open,
  x,
  y,
  onClose,
  items,
  className,
}: OverviewContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x + MENU_PADDING, top: y + MENU_PADDING });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = x + MENU_PADDING;
    let top = y + MENU_PADDING;
    if (left + rect.width > viewportW - MENU_PADDING) {
      left = Math.max(MENU_PADDING, viewportW - rect.width - MENU_PADDING);
    }
    if (top + rect.height > viewportH - MENU_PADDING) {
      top = Math.max(MENU_PADDING, viewportH - rect.height - MENU_PADDING);
    }
    if (left < MENU_PADDING) left = MENU_PADDING;
    if (top < MENU_PADDING) top = MENU_PADDING;
    setPosition({ left, top });
  }, [open, x, y]);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("click", handleClick, false);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("click", handleClick, false);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  const visibleItems = items.filter((i) => i !== undefined);

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-orientation="vertical"
      className={cn(
        "fixed z-[100] min-w-[180px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg",
        className
      )}
      style={{ left: position.left, top: position.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleItems.map((item) => (
        <React.Fragment key={item.id}>
          {item.separatorAbove && (
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" aria-hidden />
          )}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!item.disabled) {
                const action = item.onClick;
                onClose();
                // Human: Closing first avoids focus traps where the menu unmounts mid-handler; the microtask lets the browser settle focus.
                // Agent: CALLS onClose then action on next macrotask tick.
                setTimeout(() => action(), 0);
              }
            }}
            className={cn(
              "w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 rounded-none first:rounded-t-lg last:rounded-b-lg",
              "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:pointer-events-none",
              item.destructive && "text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-950/30"
            )}
          >
            {item.icon && <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
