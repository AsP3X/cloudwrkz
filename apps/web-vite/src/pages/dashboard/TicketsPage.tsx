import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Ticket } from "@/lib/types";
import { TicketViewProvider } from "@/components/features/tickets/TicketViewContext";
import { TicketViewControls } from "@/components/features/tickets/TicketViewControls";
import { TicketFilterButton } from "@/components/features/tickets/TicketFilterButton";
import { TicketFilterLoader } from "@/components/features/tickets/TicketFilterLoader";
import { TicketListView } from "@/components/features/tickets/TicketListView";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";
import { hasAgentCapabilities } from "@/lib/permissions";

// Human: Ticket inbox with filters, bulk actions, view modes, and permission-aware empty states.
// Agent: FETCH tickets list; TicketViewProvider; READS canViewTickets,canCreateTicket; REFRESH via callbacks.

export default function TicketsPage() {
  const { can } = useAuth();
  const canViewTickets = can("modules.tickets.view");
  const canCreateTicket = can("tickets.create") || can("admin.tickets.manage");
  const [tickets, setTickets] = useState<Ticket[]>([]);

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
            hiddenFields={{ context: "tickets_overview" }}
            dialogDescription="If you believe you should have access to the tickets overview, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }
  const [loading, setLoading] = useState(true);
  const [showBulkSelect, setShowBulkSelect] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isAgent = hasAgentCapabilities(can);

  const fetchTickets = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryString = searchParams.toString();
      const path = queryString ? `/tickets?${queryString}` : "/tickets";
      const data = await api.get<{ tickets: Ticket[] }>(path);
      setTickets(data.tickets);
    } catch {
      setTickets([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <TicketViewProvider>
      <div className="space-y-6">
        <TicketFilterLoader isAgent={isAgent} />

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {isAgent ? "All Tickets" : "My Tickets"}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              {isAgent ? "Manage and track all support tickets" : "Manage and track your support tickets"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canCreateTicket && (
              <Link to="/dashboard/tickets/new">
                <Button variant="primary" size="md">
                  Create Ticket
                </Button>
              </Link>
            )}
            <TicketViewControls />
            <TicketFilterButton isAgent={isAgent} />
            <div className="relative" ref={menuRef}>
              <Button variant="outline" size="md" aria-label="More options" onClick={() => setMenuOpen((o) => !o)}>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between gap-2"
                    onClick={() => { setShowBulkSelect((on) => !on); setMenuOpen(false); }}
                  >
                    <span>Select</span>
                    {showBulkSelect && (
                      <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  {canCreateTicket && (
                    <Link to="/dashboard/tickets/new" className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenuOpen(false)}>
                      Create
                    </Link>
                  )}
                  <Link to={`${ROUTES.ARCHIVE}?type=tickets`} className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenuOpen(false)}>
                    Archive
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {tickets.length > 0 && (
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
          </div>
        )}

        {tickets.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
            <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No tickets yet</h3>
            <p className="text-neutral-600 dark:text-neutral-400 mb-4">{canCreateTicket ? "Get started by creating your first ticket" : "You don't have any tickets yet."}</p>
            {canCreateTicket && (
            <Link to="/dashboard/tickets/new">
              <Button variant="primary">Create</Button>
            </Link>
            )}
          </div>
        ) : (
          <TicketListView tickets={tickets} showBulkSelect={showBulkSelect} isAgent={isAgent} onRefresh={fetchTickets} />
        )}
      </div>
    </TicketViewProvider>
  );
}
