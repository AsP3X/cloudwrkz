import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import { getAllUsers } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketFilterButton } from "@/components/features/tickets/TicketFilterButton";
import { TicketFilterLoader } from "@/components/features/tickets/TicketFilterLoader";
import { TicketListView } from "@/components/features/tickets/TicketListView";
import { TicketViewProvider } from "@/components/features/tickets/TicketViewContext";
import { TicketViewControls } from "@/components/features/tickets/TicketViewControls";

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

  if (!user || (user.role !== "USER" && user.role !== "AGENT")) {
    redirect(ROUTES.LOGIN);
  }

  // Check if user can view tickets module (module enabled AND user has permission)
  const canViewTickets = await canUserViewModule(user.id, MODULE_KEYS.TICKETS);
  
  if (!canViewTickets) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          You don&apos;t have permission to access the Tickets module. Please contact an administrator.
        </p>
      </div>
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

  // For regular users, show only tickets they created
  if (user.role !== "AGENT") {
    filters.createdById = user.id;
  }

  // Get users and groups for filter dropdown (only for agents)
  const users = user.role === "AGENT" ? await getAllUsers() : [];
  const groups = user.role === "AGENT" ? await getGroups() : [];

  // Get tickets with filters
  const tickets = await getTickets(filters);

  return (
    <TicketViewProvider>
      <div className="space-y-6">
          {/* Auto-load filter preset for agents */}
          <TicketFilterLoader users={users} groups={groups} isAgent={user.role === "AGENT"} />
          
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                {user.role === "AGENT" ? "All Tickets" : "My Tickets"}
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                {user.role === "AGENT" 
                  ? "Manage and track all support tickets" 
                  : "Manage and track your support tickets"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <TicketViewControls />
              <TicketFilterButton users={users} groups={groups} isAgent={user.role === "AGENT"} />
              <Link href="/dashboard/tickets/new">
                <Button variant="primary">Create</Button>
              </Link>
            </div>
          </div>

          {/* Results Count */}
          {tickets.length > 0 && (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Showing {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Tickets List */}
          {tickets.length === 0 ? (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
              <svg
                className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No tickets yet</h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-4">Get started by creating your first ticket</p>
              <Link href="/dashboard/tickets/new">
                <Button variant="primary">Create</Button>
              </Link>
            </div>
          ) : (
            <TicketListView tickets={tickets} />
          )}
      </div>
    </TicketViewProvider>
  );
}
