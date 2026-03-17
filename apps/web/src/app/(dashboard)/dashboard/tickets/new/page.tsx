import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { TicketForm } from "@/components/features/tickets/TicketForm";
import { getAllUsers, getAgents } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TipsTooltip } from "@/components/features/tickets/TipsTooltip";
import { hasPermission } from "@/lib/utils/permissions";

export default async function NewTicketPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);

  if (!ticketsEnabled) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          The tickets module is not currently enabled. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Check if user has permission to create tickets
  const canCreateTicket = await hasPermission(user.id, "tickets.create");

  if (!canCreateTicket) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Insufficient Permissions
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to create tickets. Please contact an administrator if you believe this is a mistake.
        </p>
        <Link href="/dashboard/tickets">
          <Button variant="primary">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  // Get users, agents, and groups for agent ticket creation (only if agent)
  const users = user.role === "AGENT" ? await getAllUsers() : [];
  const agents = user.role === "AGENT" ? await getAgents() : [];
  const groups = user.role === "AGENT" ? await getGroups() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard/tickets" className="flex-shrink-0">
            <Button variant="outline" size="sm">
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Tickets
            </Button>
          </Link>
          <div className="flex-shrink-0">
            <TipsTooltip />
          </div>
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            {user.role === "AGENT" ? "Create Ticket" : "Create New Ticket"}
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            {user.role === "AGENT" 
              ? "Create a ticket for yourself or on behalf of another user"
              : "Submit a support request, report a bug, or request a new feature"}
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <TicketForm
          isAgent={user.role === "AGENT"}
          users={users}
          agents={agents}
          groups={groups}
        />
      </div>
    </div>
  );
}
