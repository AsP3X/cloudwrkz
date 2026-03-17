import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { SidebarProvider } from "./SidebarContext";
import { DashboardSidebar, type NavCounts } from "./DashboardSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { ROUTES } from "@/lib/constants/routes";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { cn } from "@/lib/utils/cn";

interface DashboardLayoutProps {
  enabledModuleKeys?: string[];
  navCounts?: NavCounts;
}

const Spinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <svg
      className="h-10 w-10 animate-spin text-primary-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  </div>
);

function DashboardLayoutContent({
  enabledModuleKeys,
  navCounts,
}: {
  enabledModuleKeys: string[];
  navCounts?: NavCounts;
}) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <>
      <DashboardSidebar
        enabledModuleKeys={enabledModuleKeys}
        userRole={user.role}
        navCounts={navCounts}
      />
      <DashboardHeader user={user} />
    </>
  );
}

export const DashboardLayout = ({
  enabledModuleKeys = Object.values(MODULE_KEYS),
  navCounts,
}: DashboardLayoutProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate(ROUTES.LOGIN + "?error=session_expired", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    return <Spinner />;
  }

  if (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    navigate(ROUTES.HOME, { replace: true });
    return <Spinner />;
  }

  return (
    <SidebarProvider>
      <DashboardLayoutContent
        enabledModuleKeys={enabledModuleKeys}
        navCounts={navCounts}
      />
      <main
        className={cn(
          "min-h-screen bg-neutral-50 dark:bg-neutral-950",
          "lg:pl-64",
          "relative overflow-hidden"
        )}
      >
        {/* Background decoration - gradient blobs */}
        <div
          className="pointer-events-none fixed inset-0 z-0"
          aria-hidden="true"
        >
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary-200/30 dark:bg-primary-900/20 blur-3xl" />
          <div className="absolute top-1/2 -left-40 h-60 w-60 rounded-full bg-secondary-200/30 dark:bg-secondary-900/20 blur-3xl" />
        </div>

        <div className="relative z-10 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  );
};
