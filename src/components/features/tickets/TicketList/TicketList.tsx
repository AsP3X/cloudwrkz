"use client";

import React from "react";
import Link from "next/link";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import type { TicketViewMode } from "../TicketViewToggle";

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

interface TicketListProps {
  tickets: Ticket[];
  viewMode: TicketViewMode;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "OPEN":
      return "bg-blue-100 text-blue-700";
    case "IN_PROGRESS":
      return "bg-yellow-100 text-yellow-700";
    case "RESOLVED":
    case "CLOSED":
      return "bg-green-100 text-green-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 text-red-700";
    case "HIGH":
      return "bg-orange-100 text-orange-700";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
};

export const TicketList = ({ tickets, viewMode }: TicketListProps) => {
  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 overflow-hidden">
      <div className={viewMode === "compact" ? "divide-y divide-neutral-200" : "divide-y divide-neutral-200"}>
        {tickets.map((ticket) => (
          <TicketItem key={ticket.id} ticket={ticket} viewMode={viewMode} />
        ))}
      </div>
    </div>
  );
};

interface TicketItemProps {
  ticket: Ticket;
  viewMode: TicketViewMode;
}

const TicketItem = ({ ticket, viewMode }: TicketItemProps) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Title Only View
  if (viewMode === "title-only") {
    return (
      <Link
        href={`/dashboard/tickets/${ticket.id}`}
        className="block px-4 py-3 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xs font-mono font-semibold text-primary-600 flex-shrink-0">
              {ticket.ticketNumber}
            </span>
            <h3 className="text-sm font-semibold text-neutral-900 truncate">
              {ticket.title}
            </h3>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${getStatusColor(ticket.status)}`}>
            {ticket.status.replace("_", " ")}
          </span>
        </div>
      </Link>
    );
  }

  // Compact View
  if (viewMode === "compact") {
    return (
      <Link
        href={`/dashboard/tickets/${ticket.id}`}
        className="block px-4 py-3 hover:bg-neutral-50 transition-colors"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-xs font-mono font-semibold text-primary-600 flex-shrink-0">
                {ticket.ticketNumber}
              </span>
              <h3 className="text-sm font-semibold text-neutral-900 truncate">
                {ticket.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace("_", " ")}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                {ticket.priority}
              </span>
              <span className="text-xs text-neutral-500">
                {formatDate(ticket.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>
                Created by {ticket.createdBy.name || ticket.createdBy.email}
              </span>
            </div>
            {ticket.assignedTo && (
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Assigned to {ticket.assignedTo.name || ticket.assignedTo.email}
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // Normal View (default)
  if (viewMode === "normal") {
    return (
      <Link
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
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace("_", " ")}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
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
              Created {formatDate(ticket.createdAt)}
            </p>
            {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
              <p className="text-xs text-neutral-400 mt-1">
                Updated {formatDate(ticket.updatedAt)}
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
    );
  }

  // Detailed View
  return (
    <Link
      href={`/dashboard/tickets/${ticket.id}`}
      className="block p-6 hover:bg-neutral-50 transition-colors border-l-4 border-l-primary-500"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-base font-mono font-semibold text-primary-600">
                {ticket.ticketNumber}
              </span>
              <h3 className="text-xl font-bold text-neutral-900">
                {ticket.title}
              </h3>
            </div>
            {ticket.description && (
              <p className="text-sm text-neutral-700 mb-4 leading-relaxed">
                {ticket.description}
              </p>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Status
            </label>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(ticket.status)}`}>
              {ticket.status.replace("_", " ")}
            </span>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Priority
            </label>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(ticket.priority)}`}>
              {ticket.priority}
            </span>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Type
            </label>
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700">
              {getTicketTypeLabel(ticket.type as TicketType)}
            </span>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Comments
            </label>
            <span className="text-sm font-medium text-neutral-700">
              {ticket._count.comments} {ticket._count.comments === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>

        {/* Additional Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-200">
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Created
            </label>
            <p className="text-sm text-neutral-700">
              {formatDateTime(ticket.createdAt)}
            </p>
            {ticket.createdBy && (
              <p className="text-xs text-neutral-500 mt-1">
                by {ticket.createdBy.name || ticket.createdBy.email}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1 block">
              Last Updated
            </label>
            <p className="text-sm text-neutral-700">
              {formatDateTime(ticket.updatedAt)}
            </p>
            {ticket.assignedTo && (
              <p className="text-xs text-neutral-500 mt-1">
                Assigned to {ticket.assignedTo.name || ticket.assignedTo.email}
              </p>
            )}
            {ticket.assignedToGroup && (
              <p className="text-xs text-neutral-500 mt-1">
                Group: {ticket.assignedToGroup.name}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
