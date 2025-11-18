"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { type TicketViewMode } from "../TicketViewToggle";
import { TicketBulkActionsToolbar } from "../TicketBulkActionsToolbar";
import { bulkUpdateTickets, bulkDeleteTickets } from "@/server/actions/tickets";
import { TicketBulkAssignDialog } from "../TicketBulkAssignDialog";
import { TicketBulkDeleteDialog } from "../TicketBulkDeleteDialog";

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
  const router = useRouter();
  const [selectedTickets, setSelectedTickets] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  if (tickets.length === 0) {
    return null;
  }

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

  // Determine which columns to show based on view mode
  const showType = viewMode === "normal" || viewMode === "detailed";
  const showAssignedTo = viewMode === "normal" || viewMode === "detailed";
  const showCreated = viewMode === "normal" || viewMode === "detailed" || viewMode === "compact";
  const showComments = viewMode === "normal" || viewMode === "detailed";
  const showDescription = viewMode === "detailed";
  const showPriority = viewMode !== "title-only";
  const showUpdated = viewMode === "detailed";

  const allSelected = tickets.length > 0 && selectedTickets.size === tickets.length;
  const someSelected = selectedTickets.size > 0 && selectedTickets.size < tickets.length;

  // Set indeterminate state on select all checkbox
  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTickets(new Set(tickets.map((t) => t.id)));
    } else {
      setSelectedTickets(new Set());
    }
  };

  const handleSelectTicket = (ticketId: string, checked: boolean) => {
    const newSelected = new Set(selectedTickets);
    if (checked) {
      newSelected.add(ticketId);
    } else {
      newSelected.delete(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const handleBulkStatusChange = async (status: string) => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkUpdateTickets(Array.from(selectedTickets), { status: status as any });
      if (result.success) {
        setSelectedTickets(new Set());
        router.refresh();
      } else {
        setError(result.error || "Failed to update tickets");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkPriorityChange = async (priority: string) => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkUpdateTickets(Array.from(selectedTickets), { priority: priority as any });
      if (result.success) {
        setSelectedTickets(new Set());
        router.refresh();
      } else {
        setError(result.error || "Failed to update tickets");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssign = () => {
    if (selectedTickets.size === 0) return;
    setShowAssignDialog(true);
  };

  const handleBulkAssignConfirm = async (assignedToId: string | null, assignedToGroupId: string | null) => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const updates: any = {};
      if (assignedToId !== undefined) updates.assignedToId = assignedToId;
      if (assignedToGroupId !== undefined) updates.assignedToGroupId = assignedToGroupId;

      const result = await bulkUpdateTickets(Array.from(selectedTickets), updates);
      if (result.success) {
        setSelectedTickets(new Set());
        setShowAssignDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to assign tickets");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTickets.size === 0) return;
    setShowDeleteDialog(true);
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await bulkDeleteTickets(Array.from(selectedTickets));
      if (result.success) {
        setSelectedTickets(new Set());
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to delete tickets");
        setShowDeleteDialog(false);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedTickets(new Set());
    setError(null);
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {selectedTickets.size > 0 && (
        <>
          <TicketBulkActionsToolbar
            selectedCount={selectedTickets.size}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkAssign={handleBulkAssign}
            onBulkPriorityChange={handleBulkPriorityChange}
            onBulkDelete={handleBulkDelete}
            onClearSelection={handleClearSelection}
          />
          {error && (
            <div className="px-6 py-3 bg-error-50 dark:bg-error-950 border-b border-error-200 dark:border-error-800">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-error-600 dark:text-error-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
              </div>
            </div>
          )}
        </>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                <input
                  type="checkbox"
                  ref={selectAllRef}
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                  aria-label="Select all tickets"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Status
              </th>
              {showPriority && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Priority
                </th>
              )}
              {showType && (
                <th className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider ${viewMode === "normal" ? "hidden md:table-cell" : ""}`}>
                  Type
                </th>
              )}
              {showAssignedTo && (
                <th className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider ${viewMode === "normal" ? "hidden lg:table-cell" : ""}`}>
                  Assigned To
                </th>
              )}
              {showCreated && (
                <th className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider ${viewMode === "normal" ? "hidden lg:table-cell" : viewMode === "compact" ? "" : ""}`}>
                  Created
                </th>
              )}
              {showUpdated && (
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Updated
                </th>
              )}
              {showComments && (
                <th className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider ${viewMode === "normal" ? "hidden md:table-cell" : ""}`}>
                  Comments
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                className={`hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${selectedTickets.has(ticket.id) ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}
              >
                <td className="px-6 py-4 whitespace-nowrap w-12">
                  <input
                    type="checkbox"
                    checked={selectedTickets.has(ticket.id)}
                    onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                    aria-label={`Select ticket ${ticket.ticketNumber}`}
                  />
                </td>
                <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "compact" ? "px-4 py-3" : viewMode === "title-only" ? "px-4 py-2" : ""}`}>
                  <Link
                    href={`/dashboard/tickets/${ticket.id}`}
                    className={`${viewMode === "title-only" ? "text-xs" : "text-sm"} font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300`}
                  >
                    {ticket.ticketNumber}
                  </Link>
                </td>
                <td className={`px-6 py-4 ${viewMode === "compact" ? "px-4 py-3" : viewMode === "title-only" ? "px-4 py-2" : ""}`}>
                  <Link
                    href={`/dashboard/tickets/${ticket.id}`}
                    className={`${viewMode === "title-only" ? "text-xs" : "text-sm"} font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400`}
                  >
                    <div className={viewMode === "title-only" ? "max-w-xs" : "max-w-md"}>
                      <div className={viewMode === "title-only" ? "truncate" : viewMode === "compact" ? "line-clamp-1" : "truncate"}>{ticket.title}</div>
                      {showDescription && ticket.description && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">
                          {ticket.description}
                        </div>
                      )}
                      {!showDescription && viewMode === "normal" && ticket.description && (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                          {ticket.description}
                        </div>
                      )}
                    </div>
                  </Link>
                </td>
                <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "compact" ? "px-4 py-3" : viewMode === "title-only" ? "px-4 py-2" : ""}`}>
                  <span className={`px-2 py-1 rounded-full ${viewMode === "title-only" ? "text-xs" : "text-xs"} font-medium ${getStatusColor(ticket.status)}`}>
                    {ticket.status.replace("_", " ")}
                  </span>
                </td>
                {showPriority && (
                  <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "compact" ? "px-4 py-3" : ""}`}>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                )}
                {showType && (
                  <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "normal" ? "hidden md:table-cell" : ""} ${viewMode === "compact" ? "px-4 py-3" : ""}`}>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                      {getTicketTypeLabel(ticket.type as TicketType)}
                    </span>
                  </td>
                )}
                {showAssignedTo && (
                  <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "normal" ? "hidden lg:table-cell" : ""} ${viewMode === "compact" ? "px-4 py-3" : ""}`}>
                    {ticket.assignedTo ? (
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        {ticket.assignedTo.name || ticket.assignedTo.email}
                      </div>
                    ) : ticket.assignedToGroup ? (
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">Group: </span>
                        {ticket.assignedToGroup.name}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">Unassigned</span>
                    )}
                  </td>
                )}
                {showCreated && (
                  <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "normal" ? "hidden lg:table-cell" : ""} ${viewMode === "compact" ? "px-4 py-3" : ""}`}>
                    <div className={`${viewMode === "compact" ? "text-xs" : "text-sm"} text-neutral-600 dark:text-neutral-400`}>
                      {formatDate(ticket.createdAt)}
                    </div>
                    {showUpdated && ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                      <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                        Updated {formatDate(ticket.updatedAt)}
                      </div>
                    )}
                    {!showUpdated && viewMode === "normal" && ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                      <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                        Updated {formatDate(ticket.updatedAt)}
                      </div>
                    )}
                  </td>
                )}
                {showUpdated && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-neutral-600 dark:text-neutral-400">
                      {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() 
                        ? formatDateTime(ticket.updatedAt)
                        : formatDateTime(ticket.createdAt)}
                    </div>
                  </td>
                )}
                {showComments && (
                  <td className={`px-6 py-4 whitespace-nowrap ${viewMode === "normal" ? "hidden md:table-cell" : ""} ${viewMode === "compact" ? "px-4 py-3" : ""}`}>
                    {ticket._count.comments > 0 ? (
                      <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span>{ticket._count.comments}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 dark:text-neutral-500">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAssignDialog && (
        <TicketBulkAssignDialog
          open={showAssignDialog}
          onOpenChange={setShowAssignDialog}
          onConfirm={handleBulkAssignConfirm}
          selectedCount={selectedTickets.size}
        />
      )}
      {showDeleteDialog && (
        <TicketBulkDeleteDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleBulkDeleteConfirm}
          selectedCount={selectedTickets.size}
        />
      )}
    </div>
  );
};
