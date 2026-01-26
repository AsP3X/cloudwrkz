"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import type { DialogProps } from "./Dialog.types";

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ open, onOpenChange, children, title, description, infoIcon, headerIcon, headerRightContent, className, zIndex, ...props }, ref) => {
    const dialogRef = React.useRef<HTMLDivElement | null>(null);
    const internalRef = React.useCallback((node: HTMLDivElement | null) => {
      dialogRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        // Type assertion needed for readonly refs in forwardRef
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
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

    // Prevent horizontal scrolling on mobile/iOS when dialog is open
    React.useEffect(() => {
      if (!open) return;

      // Check if mobile (viewport width < 640px which is sm breakpoint)
      // Only check on client side to avoid hydration mismatch
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      
      if (isMobile) {
        // Store original values
        const originalBodyOverflowX = document.body.style.overflowX;
        const originalBodyOverflowY = document.body.style.overflowY;
        const originalBodyPosition = document.body.style.position;
        const originalBodyWidth = document.body.style.width;
        const originalBodyTop = document.body.style.top;
        const originalHtmlOverflowX = document.documentElement.style.overflowX;
        const originalHtmlOverflowY = document.documentElement.style.overflowY;
        
        // Get current scroll position
        const scrollY = window.scrollY;
        
        // Lock body to prevent scrolling
        document.body.style.overflowX = "hidden";
        document.body.style.overflowY = "hidden";
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = `-${scrollY}px`;
        
        document.documentElement.style.overflowX = "hidden";
        document.documentElement.style.overflowY = "hidden";

        // Prevent horizontal touch scrolling on iOS
        let touchStartX = 0;
        let touchStartY = 0;

        const handleTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
          }
        };

        const handleTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - touchStartX);
            const deltaY = Math.abs(touch.clientY - touchStartY);
            
            // Check if we're trying to scroll horizontally
            if (deltaX > deltaY && deltaX > 10) {
              // Check if the target is in a scrollable container
              const target = e.target as HTMLElement;
              const scrollableContainer = target.closest('[class*="overflow-y-auto"], [class*="overflow-y-scroll"]');
              
              // Only prevent if not in a scrollable container or if horizontal scroll is detected
              if (!scrollableContainer) {
                e.preventDefault();
              } else {
                // Even in scrollable containers, prevent horizontal scrolling
                const container = scrollableContainer as HTMLElement;
                if (container.scrollWidth <= container.clientWidth) {
                  e.preventDefault();
                }
              }
            }
          }
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: false });

        return () => {
          // Restore original values
          document.body.style.overflowX = originalBodyOverflowX;
          document.body.style.overflowY = originalBodyOverflowY;
          document.body.style.position = originalBodyPosition;
          document.body.style.width = originalBodyWidth;
          document.body.style.top = originalBodyTop;
          document.documentElement.style.overflowX = originalHtmlOverflowX;
          document.documentElement.style.overflowY = originalHtmlOverflowY;
          
          // Restore scroll position
          if (originalBodyPosition !== 'fixed') {
            window.scrollTo(0, scrollY);
          }
          
          document.removeEventListener('touchstart', handleTouchStart);
          document.removeEventListener('touchmove', handleTouchMove);
        };
      }

      return undefined;
    }, [open]);

    const [mounted, setMounted] = React.useState(false);
    const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);

    // Ensure we only render portal on client side
    React.useEffect(() => {
      if (typeof document !== "undefined" && document.body) {
        setMounted(true);
        setPortalContainer(document.body);
      }
    }, []);

    if (!open) return null;

    const dialogContent = (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 animate-fade-in"
          style={{ zIndex: zIndex ? zIndex - 10 : 40 }}
          onClick={() => onOpenChange?.(false)}
        />
        
        {/* Dialog */}
        <div
          className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-x-hidden sm:overflow-x-auto touch-none sm:touch-auto"
          style={{ 
            zIndex: zIndex || 50,
            touchAction: 'pan-y' 
          }}
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
              "bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800",
              zIndex ? "shadow-2xl" : "shadow-soft-xl",
              "w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden overflow-x-hidden",
              "animate-slide-in relative",
              className
            )}
            style={{ touchAction: 'pan-y' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "dialog-title" : undefined}
            {...props}
          >
            {/* Info Icon - Left of Dialog */}
            {infoIcon && (
              <div className="absolute -left-10 sm:-left-12 top-4 z-10">
                {infoIcon}
              </div>
            )}
              {/* Header */}
              {(title || description) && (
                <div className="px-4 sm:px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    {headerIcon && (
                      <div className="flex-shrink-0">
                        {headerIcon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {title && (
                        <h2 id="dialog-title" className="text-xl font-bold text-neutral-900 dark:text-neutral-100 break-words">
                          {title}
                        </h2>
                      )}
                      {description && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 break-words">{description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {headerRightContent}
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
                </div>
              )}

            {/* Content */}
            <div 
              className="overflow-y-auto overflow-x-hidden max-h-[calc(90vh-120px)]"
              style={{ 
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehaviorX: 'contain'
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </>
    );

    // Render dialog in a portal at the body level, only when mounted and container is available
    if (!mounted || !portalContainer || typeof document === "undefined" || !document.body) {
      return null;
    }

    // Ensure portalContainer is still valid (body might have changed)
    if (portalContainer !== document.body) {
      return null;
    }

    return createPortal(dialogContent, portalContainer);
  }
);

Dialog.displayName = "Dialog";
