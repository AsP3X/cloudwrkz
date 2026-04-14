"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export interface OverviewContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Optional icon (e.g. SVG). Shown before label. */
  icon?: React.ReactNode;
  /** Visual separator above this item */
  separatorAbove?: boolean;
  /** Destructive action (e.g. Delete) – uses error styling */
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

/**
 * Right-click context menu for overview list items (Tickets, Todos, Time entries, Links).
 * Renders in a portal, positions near cursor, and keeps inside viewport.
 */
export function OverviewContextMenu({
  open,
  x,
  y,
  onClose,
  items,
  className,
}: OverviewContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const baseLeft = x + MENU_PADDING;
    const baseTop = y + MENU_PADDING;
    el.style.left = `${baseLeft}px`;
    el.style.top = `${baseTop}px`;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = baseLeft;
    let top = baseTop;
    if (left + rect.width > viewportW - MENU_PADDING) {
      left = Math.max(MENU_PADDING, viewportW - rect.width - MENU_PADDING);
    }
    if (top + rect.height > viewportH - MENU_PADDING) {
      top = Math.max(MENU_PADDING, viewportH - rect.height - MENU_PADDING);
    }
    if (left < MENU_PADDING) left = MENU_PADDING;
    if (top < MENU_PADDING) top = MENU_PADDING;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Use bubble phase (false) so that clicking a menu item runs the button's onClick first;
    // the menu div's stopPropagation() then prevents this handler from running when clicking inside.
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
      style={{ left: x + MENU_PADDING, top: y + MENU_PADDING }}
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
                // Defer action so it runs after menu closes and event handling completes.
                // Fixes archive/delete not running when menu is opened via long-press (touch).
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

  if (typeof document !== "undefined") {
    return createPortal(menu, document.body);
  }
  return menu;
}
