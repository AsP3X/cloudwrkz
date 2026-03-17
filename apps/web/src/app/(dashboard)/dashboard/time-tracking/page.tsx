import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTimeEntries } from "@/server/actions/time-tracking";
import { TimeTrackingPage } from "@/components/features/time-tracking/TimeTrackingPage";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

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

export const dynamic = 'force-dynamic';

export default async function TimeTrackingPageRoute({ searchParams }: TimeTrackingPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view time tracking module (module enabled AND user has permission)
  const canViewTimeTracking = await canUserViewModule(user.id, MODULE_KEYS.TIMETRACKING);
  
  if (!canViewTimeTracking) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Time Tracking module. Please contact an
          administrator. If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "time_tracking_overview" }}
            dialogDescription="If you believe you should have access to the Time Tracking module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
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
    <TimeTrackingPage
      initialEntries={result.entries}
      initialTotal={result.total}
      initialPage={page}
      userTimezone={user.timezone ?? "UTC"}
    />
  );
}
