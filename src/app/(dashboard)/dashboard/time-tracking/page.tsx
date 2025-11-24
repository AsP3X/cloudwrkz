import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTimeEntries } from "@/server/actions/time-tracking";
import { TimeTrackingPage } from "@/components/features/time-tracking/TimeTrackingPage";

interface TimeTrackingPageProps {
  searchParams: Promise<{
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    tags?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: string;
  }>;
}

export default async function TimeTrackingPageRoute({ searchParams }: TimeTrackingPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if time tracking module is enabled
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
  
  if (!timeTrackingEnabled) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Time Tracking Module Disabled</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          The time tracking module is not currently enabled. Please contact an administrator.
        </p>
      </div>
    );
  }

  // Parse filters
  const statusFilter = params.status
    ? (params.status.split(",") as Array<"RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED">)
    : undefined;

  const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined;
  const dateTo = params.dateTo ? new Date(params.dateTo) : undefined;
  const tags = params.tags ? params.tags.split(",") : undefined;
  const sortBy = (params.sortBy as "createdAt" | "startedAt" | "totalDuration") || "createdAt";
  const sortOrder = (params.sortOrder as "asc" | "desc") || "desc";
  const page = params.page ? parseInt(params.page, 10) : 1;

  // Fetch time entries
  const result = await getTimeEntries({
    status: statusFilter,
    dateFrom,
    dateTo,
    tags,
    sortBy,
    sortOrder,
    page,
    limit: 50,
  });

  return (
    <TimeTrackingPage initialEntries={result.entries} initialTotal={result.total} initialPage={page} />
  );
}
