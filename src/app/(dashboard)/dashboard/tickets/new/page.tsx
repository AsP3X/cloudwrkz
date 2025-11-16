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

export default async function NewTicketPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "USER" && user.role !== "AGENT")) {
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

  // Get users, agents, and groups for agent ticket creation (only if agent)
  const users = user.role === "AGENT" ? await getAllUsers() : [];
  const agents = user.role === "AGENT" ? await getAgents() : [];
  const groups = user.role === "AGENT" ? await getGroups() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            {user.role === "AGENT" ? "Create Ticket" : "Create New Ticket"}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            {user.role === "AGENT" 
              ? "Create a ticket for yourself or on behalf of another user"
              : "Submit a support request, report a bug, or request a new feature"}
          </p>
        </div>
        <Link href="/dashboard/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <TicketForm isAgent={user.role === "AGENT"} users={users} agents={agents} groups={groups} />
      </div>

      {/* Help Section */}
      <div className="bg-primary-50 dark:bg-primary-900/30 rounded-xl border border-primary-200 dark:border-primary-800 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-primary-600 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary-900 dark:text-primary-100 mb-2">Tips for creating effective tickets</h3>
            <ul className="space-y-2 text-sm text-primary-800 dark:text-primary-200">
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                <span>Use a clear, descriptive title that summarizes your issue or request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                <span>Provide detailed information in the description, including steps to reproduce if reporting a bug</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                <span>Select the appropriate ticket type and priority level to help us prioritize your request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5">•</span>
                <span>Include any relevant screenshots, error messages, or additional context that might help</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
