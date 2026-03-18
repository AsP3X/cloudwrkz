import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { TicketForm } from "@/components/features/tickets/TicketForm";
import type { TicketFormUser, TicketFormGroup } from "@/components/features/tickets/TicketForm";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { TipsTooltip } from "@/components/features/tickets/TipsTooltip";

export default function TicketNewPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<TicketFormUser[]>([]);
  const [groups, setGroups] = useState<TicketFormGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreateTicket = can("tickets.create") || can("admin.tickets.manage");
  const isAgent = user?.role === "AGENT" || user?.role === "ADMIN" || user?.role === "MODERATOR";

  useEffect(() => {
    if (!user) {
      navigate("/dashboard");
      return;
    }
    if (!canCreateTicket) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (isAgent) {
          const [usersRes, groupsRes] = await Promise.all([
            api.get<{ users: TicketFormUser[]; total: number }>("/admin/users?limit=500"),
            api.get<{ groups: TicketFormGroup[] }>("/admin/groups"),
          ]);
          const agentsList = (usersRes.users || []).filter(
            (u) => u.role === "AGENT" || u.role === "ADMIN" || u.role === "MODERATOR"
          );
          setAgents(agentsList);
          setGroups(groupsRes.groups || []);
        }
      } catch {
        setAgents([]);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, isAgent, canCreateTicket, navigate]);

  if (user && !canCreateTicket) {
    return (
      <AccessDeniedWarning
        title="Insufficient Permissions"
        message="You don't have permission to create tickets. Please contact an administrator if you believe this is a mistake."
        primaryLabel="Back to Tickets"
        primaryHref="/dashboard/tickets"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/dashboard/tickets" className="flex-shrink-0">
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
            {isAgent ? "Create Ticket" : "Create New Ticket"}
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            {isAgent
              ? "Create a ticket for yourself or on behalf of another user"
              : "Submit a support request, report a bug, or request a new feature"}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        {loading && isAgent ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          </div>
        ) : (
          <TicketForm
            isAgent={isAgent}
            currentUserId={user?.id}
            agents={agents}
            groups={groups}
          />
        )}
      </div>
    </div>
  );
}
