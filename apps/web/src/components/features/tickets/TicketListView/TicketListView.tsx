"use client";

import React from "react";
import { TicketList } from "../TicketList";
import { useTicketView } from "../TicketViewContext";

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
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED" | "BANNED";
  } | null;
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED" | "BANNED";
  } | null;
  assignedToGroup: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  _count: {
    comments: number;
  };
};

interface TicketListViewProps {
  tickets: Ticket[];
  /** When true, show selection checkboxes and bulk actions. Controlled by the header "Select" menu option. */
  showBulkSelect?: boolean;
  /** When true, user can edit/archive/delete tickets (agent or equivalent). Used for context menu options. */
  isAgent?: boolean;
}

export const TicketListView = ({ tickets, showBulkSelect = false, isAgent = false }: TicketListViewProps) => {
  const { viewMode } = useTicketView();

  return (
    <div>
      <TicketList tickets={tickets} viewMode={viewMode} showBulkSelect={showBulkSelect} isAgent={isAgent} />
    </div>
  );
};
