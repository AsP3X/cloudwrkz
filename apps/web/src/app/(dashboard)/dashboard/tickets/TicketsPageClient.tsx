"use client";

import React from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { TicketFilterButton } from "@/components/features/tickets/TicketFilterButton";
import { TicketFilterLoader } from "@/components/features/tickets/TicketFilterLoader";
import { TicketListView } from "@/components/features/tickets/TicketListView";
import { TicketViewControls } from "@/components/features/tickets/TicketViewControls";

type User = { id: string; name: string | null; email: string; role: string };
type Group = { id: string; name: string; description: string | null };
type Ticket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  assignedToGroup: { id: string; name: string; description: string | null } | null;
  _count: { comments: number };
};

interface TicketsPageClientProps {
  tickets: Ticket[];
  users: User[];
  groups: Group[];
  isAgent: boolean;
}

export function TicketsPageClient({ tickets, users, groups, isAgent }: TicketsPageClientProps) {
  const [showBulkSelect, setShowBulkSelect] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="space-y-6">
      <TicketFilterLoader users={users} groups={groups} isAgent={isAgent} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            {isAgent ? "All Tickets" : "My Tickets"}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            {isAgent
              ? "Manage and track all support tickets"
              : "Manage and track your support tickets"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TicketViewControls />
          <TicketFilterButton users={users} groups={groups} isAgent={isAgent} />
          <div className="relative" ref={menuRef}>
            <Button
              variant="outline"
              size="md"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between gap-2"
                  onClick={() => {
                    setShowBulkSelect((on) => !on);
                    setMenuOpen(false);
                  }}
                >
                  <span>Select</span>
                  {showBulkSelect && (
                    <svg className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <Link
                  href="/dashboard/tickets/new"
                  className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => setMenuOpen(false)}
                >
                  Create
                </Link>
                <Link
                  href={`${ROUTES.ARCHIVE}?type=tickets`}
                  className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => setMenuOpen(false)}
                >
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
        <TicketListView tickets={tickets} showBulkSelect={showBulkSelect} isAgent={isAgent} />
      )}
    </div>
  );
}
