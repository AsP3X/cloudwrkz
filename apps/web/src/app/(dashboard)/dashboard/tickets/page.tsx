import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import { getAllUsers } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import { TicketViewProvider } from "@/components/features/tickets/TicketViewContext";
import { TicketsPageClient } from "./TicketsPageClient";
import { hasPermission } from "@/lib/utils/permissions";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { createAccessIssueTicket } from "@/server/actions/access-issues";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

interface TicketsPageProps {
  searchParams: Promise<{
    status?: string;
    createdBy?: string;
    assignedToGroup?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sort?: string;
  }>;
}

// Force dynamic rendering to prevent caching issues with permissions
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view tickets module (module enabled AND user has permission)
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  
  if (!canViewTickets) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Tickets module. Please contact an administrator.
            If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            action={createAccessIssueTicket}
            hiddenFields={{ context: "tickets_overview" }}
            dialogDescription="If you believe you should have access to the tickets overview, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }

  // Parse sort parameter
  const sortParam = params.sort || "createdAt-desc";
  const [sortBy, sortOrder] = sortParam.split("-") as ["createdAt" | "updatedAt", "asc" | "desc"];

  // Build filters
  const filters: any = {
    sortBy: sortBy || "createdAt",
    sortOrder: sortOrder || "desc",
  };

  // By default, show only unresolved tickets (OPEN, IN_PROGRESS, PENDING)
  // unless the user explicitly chooses a different status filter.
  //
  // Special case:
  // - status=ALL means "no status filter" (show all statuses)
  if (params.status && params.status !== "ALL") {
    filters.status = params.status;
  } else if (!params.status) {
    filters.status = "UNRESOLVED";
  }
  if (params.createdBy) {
    filters.createdById = params.createdBy;
  }
  if (params.assignedToGroup) {
    filters.assignedToGroupId = params.assignedToGroup;
  }
  if (params.createdFrom) {
    filters.createdFrom = params.createdFrom;
  }
  if (params.createdTo) {
    filters.createdTo = params.createdTo;
  }
  if (params.updatedFrom) {
    filters.updatedFrom = params.updatedFrom;
  }
  if (params.updatedTo) {
    filters.updatedTo = params.updatedTo;
  }

  // Only users with the explicit "view all tickets" permission can see all tickets.
  // Everyone else (including admins without this permission) gets a restricted view.
  const canSeeAllTickets = await hasPermission(user.id, "tickets.view_all");
  if (!canSeeAllTickets) {
    filters.createdById = user.id;
  }

  // Get users and groups for filter dropdown (agents, admins, moderators)
  const users = canSeeAllTickets ? await getAllUsers() : [];
  const groups = canSeeAllTickets ? await getGroups() : [];

  // Get tickets with filters
  const tickets = await getTickets(filters);

  return (
    <TicketViewProvider>
      <TicketsPageClient
        tickets={tickets as any}
        users={users}
        groups={groups}
        isAgent={canSeeAllTickets}
      />
    </TicketViewProvider>
  );
}
