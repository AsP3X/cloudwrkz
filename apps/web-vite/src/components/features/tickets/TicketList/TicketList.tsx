import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { getTicketTypeLabel, type TicketType } from "@/lib/utils/tickets";
import { formatUserName } from "@/lib/utils/users";
import { formatDate } from "@/lib/utils/date";
import { type TicketViewMode } from "../TicketViewToggle";
import { TicketBulkActionsToolbar } from "../TicketBulkActionsToolbar";
import { TicketBulkAssignDialog } from "../TicketBulkAssignDialog";
import { TicketBulkDeleteDialog } from "../TicketBulkDeleteDialog";
import { Checkbox } from "@/components/ui/Checkbox";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { cn } from "@/lib/utils/cn";
import { api } from "@/api/client";
import type { Ticket } from "@/lib/types";

interface TicketListProps {
  tickets: Ticket[];
  viewMode: TicketViewMode;
  showBulkSelect?: boolean;
  isAgent?: boolean;
  onRefresh?: () => void;
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

export const TicketList = ({ tickets, viewMode, showBulkSelect = false, isAgent = false, onRefresh }: TicketListProps) => {
  const navigate = useNavigate();
  const showSelectionUi = showBulkSelect;

  const [selectedTickets, setSelectedTickets] = React.useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; ticket: Ticket } | null>(null);

  React.useEffect(() => {
    if (!showBulkSelect) setSelectedTickets(new Set());
  }, [showBulkSelect]);

  const allSelected = tickets.length > 0 && selectedTickets.size === tickets.length;
  const someSelected = selectedTickets.size > 0 && selectedTickets.size < tickets.length;

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
      await api.patch("/tickets/bulk", { ids: Array.from(selectedTickets), status });
      setSelectedTickets(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tickets");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkPriorityChange = async (priority: string) => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.patch("/tickets/bulk", { ids: Array.from(selectedTickets), priority });
      setSelectedTickets(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tickets");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssign = () => {
    if (selectedTickets.size === 0) return;
    setShowAssignDialog(true);
  };

  const handleBulkAssignConfirm = async (assignedToId?: string | null, assignedToGroupId?: string | null) => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      const updates: Record<string, unknown> = { ids: Array.from(selectedTickets) };
      if (assignedToId !== undefined) updates.assignedToId = assignedToId;
      if (assignedToGroupId !== undefined) updates.assignedToGroupId = assignedToGroupId;

      await api.patch("/tickets/bulk", updates);
      setSelectedTickets(new Set());
      setShowAssignDialog(false);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign tickets");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedTickets.size === 0) return;
    setShowDeleteDialog(true);
  };

  const handleBulkArchive = async () => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.post("/tickets/bulk-archive", { ids: Array.from(selectedTickets) });
      setSelectedTickets(new Set());
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive tickets");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedTickets.size === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      await api.post("/tickets/bulk-delete", { ids: Array.from(selectedTickets) });
      setSelectedTickets(new Set());
      setShowDeleteDialog(false);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tickets");
      setShowDeleteDialog(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedTickets(new Set());
    setError(null);
  };

  const handleSingleArchive = React.useCallback(
    async (ticketId: string) => {
      setContextMenu(null);
      setIsProcessing(true);
      setError(null);
      try {
        await api.post("/tickets/bulk-archive", { ids: [ticketId] });
        onRefresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to archive ticket");
      } finally {
        setIsProcessing(false);
      }
    },
    [onRefresh]
  );

  const handleOpenDeleteForTicket = React.useCallback((ticketId: string) => {
    setContextMenu(null);
    setSelectedTickets(new Set([ticketId]));
    setShowDeleteDialog(true);
  }, []);

  const getTicketContextMenuItems = React.useCallback(
    (ticket: Ticket): OverviewContextMenuItem[] => {
      const items: OverviewContextMenuItem[] = [
        {
          id: "open",
          label: "Open",
          onClick: () => {
            setContextMenu(null);
            navigate(`/dashboard/tickets/${ticket.id}`);
          },
        },
      ];
      if (isAgent) {
        items.push({
          id: "edit",
          label: "Edit",
          onClick: () => {
            setContextMenu(null);
            navigate(`/dashboard/tickets/${ticket.id}/edit`);
          },
        });
      }
      items.push(
        {
          id: "archive",
          label: "Archive",
          onClick: () => handleSingleArchive(ticket.id),
          disabled: isProcessing,
          separatorAbove: isAgent,
        },
        {
          id: "delete",
          label: "Delete",
          onClick: () => handleOpenDeleteForTicket(ticket.id),
          disabled: isProcessing,
          destructive: true,
        }
      );
      return items;
    },
    [isAgent, isProcessing, navigate, handleSingleArchive, handleOpenDeleteForTicket]
  );

  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      {showSelectionUi && selectedTickets.size > 0 && (
        <>
          <TicketBulkActionsToolbar
            selectedCount={selectedTickets.size}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkAssign={handleBulkAssign}
            onBulkPriorityChange={handleBulkPriorityChange}
            onBulkArchive={handleBulkArchive}
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
            const isSelected = selectedTickets.has(ticket.id);

            const cardClassName = cn(
              "hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors",
              isSelected && "bg-primary-50/50 dark:bg-primary-900/10"
            );

            return (
              <div
                key={ticket.id}
                className={cn(cardClassName, "p-3 sm:p-4")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, ticket });
                }}
              >
                <div className="flex items-start gap-3 mb-3">
                  {showSelectionUi && (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                        aria-label={`Select ${ticket.ticket_number}`}
                        className="flex-shrink-0"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Mobile: Stack ID and badges vertically */}
                    <div className="flex flex-col sm:hidden mb-2">
                      <Link
                        to={`/dashboard/tickets/${ticket.id}`}
                        className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 mb-1.5"
                      >
                        {ticket.ticket_number}
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
                        to={`/dashboard/tickets/${ticket.id}`}
                        className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {ticket.ticket_number}
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
                      to={`/dashboard/tickets/${ticket.id}`}
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
                      {ticket.assigned_to
                        ? formatUserName(ticket.assigned_to)
                        : ticket.assigned_to_group
                        ? `Group: ${ticket.assigned_to_group.name}`
                        : "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                    <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Created:</span>
                    <span className="text-neutral-900 dark:text-neutral-100">{formatDate(ticket.created_at)}</span>
                  </div>
                  {ticket.updated_at && new Date(ticket.updated_at).getTime() !== new Date(ticket.created_at).getTime() && (
                    <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Updated:</span>
                      <span className="text-neutral-900 dark:text-neutral-100">{formatDate(ticket.updated_at)}</span>
                    </div>
                  )}
                  {ticket.comment_count > 0 && (
                    <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                      <span className="font-medium min-w-[80px] sm:min-w-[100px] text-[11px] sm:text-xs">Comments:</span>
                      <div className="flex items-center gap-1 text-neutral-900 dark:text-neutral-100">
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span>{ticket.comment_count}</span>
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
                {showSelectionUi && (
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider w-12">
                    <div className="flex items-center">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        aria-label="Select all tickets"
                      />
                    </div>
                  </th>
                )}
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
                const isSelected = selectedTickets.has(ticket.id);

                const rowClassName = cn(
                  "hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors",
                  isSelected && "bg-primary-50 dark:bg-primary-900/20"
                );

                return (
                  <tr
                    key={ticket.id}
                    className={rowClassName}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, ticket });
                    }}
                  >
                    {showSelectionUi && (
                      <td className="px-6 py-4 whitespace-nowrap w-12" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center">
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                            aria-label={`Select ticket ${ticket.ticket_number}`}
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/dashboard/tickets/${ticket.id}`}
                        className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                      >
                        {ticket.ticket_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/dashboard/tickets/${ticket.id}`}
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
                      {ticket.assigned_to ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          {formatUserName(ticket.assigned_to)}
                        </div>
                      ) : ticket.assigned_to_group ? (
                        <div className="text-sm text-neutral-700 dark:text-neutral-300">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">Group: </span>
                          {ticket.assigned_to_group.name}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400 dark:text-neutral-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(ticket.created_at)}
                      </div>
                      {ticket.updated_at && new Date(ticket.updated_at).getTime() !== new Date(ticket.created_at).getTime() && (
                        <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                          Updated {formatDate(ticket.updated_at)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      {ticket.comment_count > 0 ? (
                        <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span>{ticket.comment_count}</span>
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
      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getTicketContextMenuItems(contextMenu.ticket) : []}
      />
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
