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
}

export const TicketListView = ({ tickets }: TicketListViewProps) => {
  const { viewMode, isReady } = useTicketView();
  
  // Don't render until we've loaded the correct view mode from localStorage
  // This prevents flashing between "table" and "card" views
  if (!isReady) {
    return null;
  }
  
  return (
    <div>
      <TicketList tickets={tickets} viewMode={viewMode} />
    </div>
  );
};
