"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

interface TaskDetailLayoutProps {
  defaultSidebarOpen?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M9 5l7 7-7 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InfoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 16v-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="8"
      r="1"
      fill="currentColor"
    />
  </svg>
);

export const TaskDetailLayout = ({
  defaultSidebarOpen = true,
  sidebar,
  children,
}: TaskDetailLayoutProps) => {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = React.useState(defaultSidebarOpen);
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mobileDrawerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDrawerOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileDrawerOpen]);

  React.useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen]);

  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      // If we cross into desktop breakpoint, ensure the mobile drawer closes.
      if (mql.matches) setMobileDrawerOpen(false);
    };

    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);


  return (
    <div className="relative">
      <div className="flex justify-end gap-2 mb-4">
        {/* Mobile toggle (drawer) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => setMobileDrawerOpen((v) => !v)}
          aria-expanded={mobileDrawerOpen}
          aria-controls="task-info-sidebar-mobile"
        >
          <InfoIcon className="h-4 w-4" />
          <span className="ml-2">{mobileDrawerOpen ? "Close info" : "Task info"}</span>
        </Button>
      </div>

      <div
        className={cn(
          "flex items-start",
          desktopSidebarOpen ? "lg:gap-6" : "lg:gap-3"
        )}
      >
        <div className="flex-1 min-w-0 space-y-6">{children}</div>

        {/* Desktop: collapsible sidebar rail that never fully disappears */}
        <aside
          id="task-info-sidebar-desktop"
          className={cn(
            "hidden lg:block shrink-0 sticky top-6 self-start relative",
            desktopSidebarOpen ? "w-[360px]" : "w-12"
          )}
          aria-label="Task information sidebar"
        >
          {/* Morphing container - extends from squircle to box (right to left, top to down) */}
          <div
            className={cn(
              "absolute top-0 right-0 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden",
              "transition-all duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]",
              "flex flex-col",
              desktopSidebarOpen
                ? "bg-white dark:bg-neutral-900 w-full"
                : "bg-blue-600 dark:bg-blue-500 w-12 h-12 group"
            )}
            style={{
              height: desktopSidebarOpen ? "auto" : "48px",
              minHeight: desktopSidebarOpen ? "auto" : "48px",
            }}
            aria-expanded={desktopSidebarOpen}
            aria-controls="task-info-sidebar-desktop"
          >
            {/* Icon button - visible when collapsed, positioned at top-right */}
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen(true)}
              className={cn(
                "absolute top-0 right-0 flex items-center justify-center transition-all duration-700",
                desktopSidebarOpen
                  ? "opacity-0 scale-0 pointer-events-none"
                  : "opacity-100 scale-100 w-12 h-12"
              )}
              aria-expanded={desktopSidebarOpen}
              aria-controls="task-info-sidebar-desktop"
              title="Show task information"
            >
              <InfoIcon className="h-6 w-6 text-white" />
            </button>

            {/* Sidebar content - appears after button expands */}
            <div
              className={cn(
                "transition-all duration-500",
                desktopSidebarOpen
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2 pointer-events-none"
              )}
              style={{
                transitionDelay: desktopSidebarOpen ? "500ms" : "0ms",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                    Task information
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 px-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDesktopSidebarOpen(false);
                  }}
                  aria-expanded={desktopSidebarOpen}
                  aria-controls="task-info-sidebar-desktop"
                  title="Collapse sidebar"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="p-4">{sidebar}</div>
            </div>

            {/* Tooltip for collapsed state */}
            {!desktopSidebarOpen && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                <div className="relative bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-medium px-2 py-1 rounded shadow-lg">
                  Task info
                  <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-neutral-900 dark:border-r-neutral-100"></div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50",
          mobileDrawerOpen ? "" : "pointer-events-none"
        )}
        aria-hidden={!mobileDrawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-neutral-900/40 transition-opacity duration-200",
            mobileDrawerOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileDrawerOpen(false)}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Task information"
          className={cn(
            "absolute inset-y-0 right-0 w-[92vw] max-w-[420px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl transition-transform duration-200 ease-out flex flex-col",
            mobileDrawerOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                Task information
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMobileDrawerOpen(false)}
              aria-controls="task-info-sidebar-mobile"
              aria-expanded={mobileDrawerOpen}
            >
              Close
            </Button>
          </div>

          <div id="task-info-sidebar-mobile" className="p-4 overflow-y-auto">
            <div className="rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
              {sidebar}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

