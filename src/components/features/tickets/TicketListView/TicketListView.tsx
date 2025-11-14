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
  };
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
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
  const { viewMode } = useTicketView();

  return <TicketList tickets={tickets} viewMode={viewMode} />;
};
