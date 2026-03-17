import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTimeEntry, timeEntryExists } from "@/server/actions/time-tracking";
import { notFound } from "next/navigation";
import { TimeEntryDetailPage } from "@/components/features/time-tracking/TimeEntryDetailPage";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

interface TimeEntryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TimeEntryDetailPageRoute({ params }: TimeEntryDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

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
            hiddenFields={{ context: "time_tracking_module" }}
            dialogDescription="If you believe you should have access to the Time Tracking module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  const entry = await getTimeEntry(id);

  if (!entry) {
    const exists = await timeEntryExists(id);

    if (!exists) {
      notFound();
    }

    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to view this time entry. The permission may have been
            removed or you may not have been granted access. If you believe this is a mistake, you
            can create a support ticket so an administrator can review your access.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "time_entry_detail", entityId: id }}
            dialogDescription="If you believe you should have access to this time entry, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.TIME_TRACKING}
        secondaryLabel="Back to Time Tracking"
      />
    );
  }

  return <TimeEntryDetailPage initialEntry={entry} userTimezone={user.timezone ?? "UTC"} />;
}

export const dynamic = "force-dynamic";
