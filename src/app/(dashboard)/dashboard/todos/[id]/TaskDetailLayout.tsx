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
    <path
      d="M12 22a10 10 0 100-20 10 10 0 000 20z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 16v-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 8h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
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

        {/* Desktop toggle (sidebar collapse into rail) */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden lg:inline-flex"
          onClick={() => setDesktopSidebarOpen((v) => !v)}
          aria-expanded={desktopSidebarOpen}
          aria-controls="task-info-sidebar-desktop"
        >
          <InfoIcon className="h-4 w-4" />
          <span className="ml-2">{desktopSidebarOpen ? "Hide task info" : "Show task info"}</span>
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
            "hidden lg:block shrink-0 sticky top-6 self-start overflow-hidden transition-[width] duration-200 ease-out",
            desktopSidebarOpen ? "w-[360px]" : "w-12"
          )}
          aria-label="Task information sidebar"
        >
          {desktopSidebarOpen ? (
            <div className="rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
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
                  onClick={() => setDesktopSidebarOpen(false)}
                  aria-expanded={desktopSidebarOpen}
                  aria-controls="task-info-sidebar-desktop"
                  title="Collapse sidebar"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4">{sidebar}</div>
            </div>
          ) : (
            <div className="rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 backdrop-blur p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 w-10 px-0"
                onClick={() => setDesktopSidebarOpen(true)}
                aria-expanded={desktopSidebarOpen}
                aria-controls="task-info-sidebar-desktop"
                title="Show task information"
              >
                <InfoIcon className="h-5 w-5" />
              </Button>
            </div>
          )}
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

