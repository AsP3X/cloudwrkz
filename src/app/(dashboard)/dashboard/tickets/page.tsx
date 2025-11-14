import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTickets } from "@/server/actions/tickets";
import { getAllUsers } from "@/server/actions/users";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { TicketFilterButton } from "@/components/features/tickets/TicketFilterButton";
import { TicketFilterLoader } from "@/components/features/tickets/TicketFilterLoader";

interface TicketsPageProps {
  searchParams: Promise<{
    status?: string;
    createdBy?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sort?: string;
  }>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT")) {
    redirect(ROUTES.LOGIN);
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
  
  if (!ticketsEnabled) {
    return (
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600">
          The tickets module is not currently enabled. Please contact an administrator.
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

  if (params.status) {
    filters.status = params.status;
  }
  if (params.createdBy) {
    filters.createdById = params.createdBy;
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

  // For regular users, always filter by their own tickets
  if (user.role !== "AGENT") {
    filters.createdById = user.id;
  }

  // Get users for filter dropdown (only for agents)
  const users = user.role === "AGENT" ? await getAllUsers() : [];

  // Get tickets with filters
  const tickets = await getTickets(filters);

  return (
    <div className="space-y-6">
      {/* Auto-load filter preset for agents */}
      <TicketFilterLoader isAgent={user.role === "AGENT"} />
      
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">
            {user.role === "AGENT" ? "All Tickets" : "My Tickets"}
          </h1>
          <p className="text-neutral-600 mt-1">
            {user.role === "AGENT" 
              ? "Manage and track all support tickets" 
              : "Manage and track your support tickets"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TicketFilterButton users={users} isAgent={user.role === "AGENT"} />
          <Link href="/dashboard/tickets/new">
            <Button variant="primary">Create Ticket</Button>
          </Link>
        </div>
      </div>

      {/* Results Count */}
      {tickets.length > 0 && (
        <div className="text-sm text-neutral-600">
          Showing {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-12 text-center">
          <svg
            className="w-16 h-16 text-neutral-300 mx-auto mb-4"
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
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">No tickets yet</h3>
          <p className="text-neutral-600 mb-4">Get started by creating your first ticket</p>
          <Link href="/dashboard/tickets/new">
            <Button variant="primary">Create Ticket</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 overflow-hidden">
          <div className="divide-y divide-neutral-200">
            {tickets.map((ticket: typeof tickets[0]) => (
              <Link
                key={ticket.id}
                href={`/dashboard/tickets/${ticket.id}`}
                className="block p-6 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono font-semibold text-primary-600">
                        {ticket.ticketNumber}
                      </span>
                      <h3 className="text-lg font-semibold text-neutral-900">
                        {ticket.title}
                      </h3>
                    </div>
                    {ticket.description && (
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {ticket.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          ticket.status === "OPEN"
                            ? "bg-blue-100 text-blue-700"
                            : ticket.status === "IN_PROGRESS"
                            ? "bg-yellow-100 text-yellow-700"
                            : ticket.status === "RESOLVED" || ticket.status === "CLOSED"
                            ? "bg-green-100 text-green-700"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          ticket.priority === "URGENT"
                            ? "bg-red-100 text-red-700"
                            : ticket.priority === "HIGH"
                            ? "bg-orange-100 text-orange-700"
                            : ticket.priority === "MEDIUM"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {ticket.priority}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </span>
                      {ticket._count.comments > 0 && (
                        <span className="text-sm text-neutral-500">
                          {ticket._count.comments} comment{ticket._count.comments !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm text-neutral-500">
                      Created {new Date(ticket.createdAt).toLocaleDateString()}
                    </p>
                    {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                      <p className="text-xs text-neutral-400 mt-1">
                        Updated {new Date(ticket.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                    {ticket.assignedTo && (
                      <p className="text-xs text-neutral-400 mt-1">
                        Assigned to {ticket.assignedTo.name || ticket.assignedTo.email}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
