"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { formatUserName } from "@/lib/utils/users";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { type TicketViewMode } from "../TicketViewToggle";
import { TicketBulkActionsToolbar } from "../TicketBulkActionsToolbar";
import { bulkUpdateTickets, bulkDeleteTickets } from "@/server/actions/tickets";
import { TicketBulkAssignDialog } from "../TicketBulkAssignDialog";
import { TicketBulkDeleteDialog } from "../TicketBulkDeleteDialog";
import { cn } from "@/lib/utils/cn";

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
  createdById?: string | null;
  createdByName?: string | null;
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

interface TicketListProps {
  tickets: Ticket[];
  viewMode: TicketViewMode;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "OPEN":
      return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
    case "IN_PROGRESS":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
    case "RESOLVED":
    case "CLOSED":
      return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
    case "HIGH":
      return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
    case "MEDIUM":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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

  if (tickets.length === 0) {
    return null;
  }

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
      {/* Card View */}
      {viewMode === "card" && (
        <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {tickets.map((ticket) => {
            const isSelected = mounted && selectedTickets.has(ticket.id);
            
            const cardClassName = cn(
              "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
              isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
            );

            return (
              <div key={ticket.id} className={cn(cardClassName, "p-3 sm:p-4")}>
                <div className="flex items-start gap-3 mb-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectTicket(ticket.id, e.target.checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 mt-1 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer flex-shrink-0"
                    aria-label={`Select ${ticket.ticketNumber}`}
                  />
                  <div className="flex-1 min-w-0">
                    {/* Mobile: Stack ID and badges vertically */}
                    <div className="flex flex-col sm:hidden mb-2">
                      <Link 
                        href={`/dashboard/tickets/${ticket.id}`}
                        className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-1.5"
                      >
                        {ticket.ticketNumber}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={cn(getStatusColor(ticket.status), "text-[9px] px-1.5 py-0.5")}>
                          {ticket.status.replace("_", " ")}
                        </Badge>
                        <Badge className={cn(getPriorityColor(ticket.priority), "text-[9px] px-1.5 py-0.5")}>
                          {ticket.priority}
                        </Badge>
                        <Badge className={cn("bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300", "text-[9px] px-1.5 py-0.5")}>
                          {getTicketTypeLabel(ticket.type as TicketType)}
                        </Badge>
                      </div>
                    </div>
                    {/* Desktop: ID and badges in a row */}
                    <div className="hidden sm:flex flex-wrap items-center gap-2 mb-2">
                      <Link 
                        href={`/dashboard/tickets/${ticket.id}`}
                        className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {ticket.ticketNumber}
                      </Link>
                      <Badge className={cn(getStatusColor(ticket.status), "text-xs")}>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <Badge className={cn(getPriorityColor(ticket.priority), "text-xs")}>
                        {ticket.priority}
                      </Badge>
                      <Badge className={cn("bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300", "text-xs")}>
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </Badge>
                    </div>
                    <Link 
                      href={`/dashboard/tickets/${ticket.id}`}
                      className="block font-semibold text-sm sm:text-base text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 mb-1"
                    >
                      {ticket.title}
                    </Link>
                    {ticket.description && (
                      <div className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mb-2 line-clamp-2">
                        {ticket.description}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Assigned To:</span>
                    <span className="text-neutral-900 dark:text-neutral-100">
                      {ticket.assignedTo 
                        ? formatUserName(ticket.assignedTo)
                        : ticket.assignedToGroup 
                        ? `Group: ${ticket.assignedToGroup.name}`
                        : "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Created:</span>
                    <span className="text-neutral-900 dark:text-neutral-100">{formatDate(ticket.createdAt)}</span>
                  </div>
                  {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                    <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Updated:</span>
                      <span className="text-neutral-900 dark:text-neutral-100">{formatDate(ticket.updatedAt)}</span>
                    </div>
                  )}
                  {ticket._count.comments > 0 && (
                    <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Comments:</span>
                      <div className="flex items-center gap-1 text-neutral-900 dark:text-neutral-100">
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span>{ticket._count.comments}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {tickets.map((ticket) => {
                const isSelected = mounted && selectedTickets.has(ticket.id);
                
                const rowClassName = cn(
                  "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                  isSelected && "bg-primary-50 dark:bg-primary-900/20"
                );

                return (
                  <tr key={ticket.id} className={rowClassName}>
                    <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectTicket(ticket.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-primary-600 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 rounded focus:ring-primary-500 focus:ring-2 cursor-pointer"
                        aria-label={`Select ticket ${ticket.ticketNumber}`}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        <div className="max-w-md">
                          <div className="truncate">{ticket.title}</div>
                          {ticket.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                              {ticket.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={getStatusColor(ticket.status)}>{ticket.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={getPriorityColor(ticket.priority)}>{ticket.priority}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <Badge className="bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                        {getTicketTypeLabel(ticket.type as TicketType)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      {ticket.assignedTo ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {formatUserName(ticket.assignedTo)}
                        </div>
                      ) : ticket.assignedToGroup ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">Group: </span>
                          {ticket.assignedToGroup.name}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(ticket.createdAt)}
                      </div>
                      {ticket.updatedAt && ticket.updatedAt.getTime() !== ticket.createdAt.getTime() && (
                        <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                          Updated {formatDate(ticket.updatedAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      {ticket._count.comments > 0 ? (
                        <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span>{ticket._count.comments}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
