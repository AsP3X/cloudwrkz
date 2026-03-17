"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

interface LinkDetailLayoutProps {
  defaultSidebarOpen?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export const SidebarContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}>({
  isOpen: true,
  setIsOpen: () => {},
});

export const useSidebar = () => React.useContext(SidebarContext);

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

const ChevronLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M15 19l-7-7 7-7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LinkDetailLayout = ({
  defaultSidebarOpen = true,
  sidebar,
  children,
}: LinkDetailLayoutProps) => {
  const sidebarContext = React.useContext(SidebarContext);
  const desktopSidebarOpen = sidebarContext.isOpen;
  const setDesktopSidebarOpen = sidebarContext.setIsOpen;
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
      if (mql.matches) setMobileDrawerOpen(false);
    };

    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="relative">
      {/* Mobile arrow toggle - fixed on RIGHT side */}
      <button
        type="button"
        onClick={() => setMobileDrawerOpen((v) => !v)}
        aria-expanded={mobileDrawerOpen}
        aria-controls="link-info-sidebar-mobile"
        aria-label={mobileDrawerOpen ? "Close link information" : "Open link information"}
        className={cn(
          "lg:hidden fixed top-32 right-0 z-40",
          "flex items-center justify-center",
          "w-8 h-20",
          "bg-white dark:bg-neutral-800",
          "border border-l border-y border-r-0 border-neutral-300 dark:border-neutral-600",
          "rounded-l-full",
          "shadow-lg hover:shadow-xl",
          "hover:bg-neutral-50 dark:hover:bg-neutral-700",
          "active:bg-neutral-100 dark:active:bg-neutral-600",
          "transition-all duration-200",
          "touch-manipulation"
        )}
        style={{
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {mobileDrawerOpen ? (
          <ChevronRightIcon className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
        ) : (
          <ChevronLeftIcon className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
        )}
      </button>

      <div className="flex items-start">
        <div
          className={cn(
            "flex-1 min-w-0 space-y-6",
            desktopSidebarOpen ? "lg:pr-[372px]" : "lg:pr-[60px]"
          )}
        >
          {children}
        </div>

        {/* Desktop: sidebar */}
        <aside
          id="link-info-sidebar-desktop"
          className={cn(
            "hidden lg:block shrink-0 fixed right-0 top-16 bottom-0 z-40",
            "transition-[width] duration-300 ease-in-out overflow-hidden",
            desktopSidebarOpen ? "w-[360px]" : "w-12"
          )}
          aria-label="Link information sidebar"
        >
          <div className={cn(
            "h-full flex flex-col bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-lg",
            desktopSidebarOpen ? "w-[360px]" : "w-12"
          )}>
            {desktopSidebarOpen ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      Link information
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    onClick={() => setDesktopSidebarOpen(false)}
                    aria-expanded={desktopSidebarOpen}
                    aria-controls="link-info-sidebar-desktop"
                    title="Collapse sidebar"
                    style={{
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <ChevronRightIcon className="h-4 w-4 pointer-events-none" />
                  </Button>
                </div>

                {/* Content - scrollable */}
                <div className="flex-1 overflow-y-auto p-4 min-h-0">{sidebar}</div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(true)}
                className="h-full w-full flex items-center justify-center hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-700 transition-colors cursor-pointer"
                aria-expanded={desktopSidebarOpen}
                aria-controls="link-info-sidebar-desktop"
                title="Show link information"
                style={{ 
                  minHeight: '44px', 
                  minWidth: '44px',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                <ChevronLeftIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400 pointer-events-none" />
              </button>
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
          role="presentation"
          className={cn(
            "absolute inset-0 bg-neutral-900/40 transition-opacity duration-200",
            mobileDrawerOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileDrawerOpen(false)}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Link information"
          className={cn(
            "absolute inset-y-0 right-0 w-[92vw] max-w-[420px] bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl transition-transform duration-200 ease-out flex flex-col",
            mobileDrawerOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                Link information
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMobileDrawerOpen(false)}
              aria-controls="link-info-sidebar-mobile"
              aria-expanded={mobileDrawerOpen}
            >
              Close
            </Button>
          </div>

          <div id="link-info-sidebar-mobile" className="p-4 overflow-y-auto">
            <div className="rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
              {sidebar}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
