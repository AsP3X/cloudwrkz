import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTicket } from "@/server/actions/tickets";
import { getAgents } from "@/server/actions/users";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TicketEditForm } from "@/components/features/tickets/TicketEditForm";
import { notFound } from "next/navigation";

interface TicketEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketEditPage({ params }: TicketEditPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Only agents, admins, and moderators can edit tickets
  if (user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR") {
    redirect(ROUTES.DASHBOARD);
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);

  if (!ticketsEnabled) {
    return (
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600 mb-4">
          The tickets module is not currently enabled. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const ticket = await getTicket(id);

  if (!ticket) {
    notFound();
  }

  // Check if user has permission to edit this ticket
  // Creator, assigned agent, admin, or moderator can edit
  const canEdit =
    ticket.createdById === user.id ||
    user.role === "ADMIN" ||
    user.role === "MODERATOR" ||
    (user.role === "AGENT" && ticket.assignedToId === user.id) ||
    user.role === "AGENT"; // Agents can edit all tickets

  if (!canEdit) {
    redirect(`/dashboard/tickets/${id}`);
  }

  // Get agents for assignment dropdown
  const agents = await getAgents();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/tickets/${id}`}>
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Ticket
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-lg font-mono font-semibold text-primary-600">
                {ticket.ticketNumber}
              </span>
              <h1 className="text-3xl font-bold text-neutral-900">Edit Ticket</h1>
            </div>
            <p className="text-neutral-600">
              Update ticket details, status, priority, and assignment
            </p>
          </div>
        </div>
      </div>

      {/* Edit Form Card */}
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <TicketEditForm
          ticket={{
            id: ticket.id,
            title: ticket.title,
            description: ticket.description,
            type: ticket.type,
            priority: ticket.priority,
            status: ticket.status,
            assignedToId: ticket.assignedToId,
          }}
          agents={agents}
        />
      </div>
    </div>
  );
}
