"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { deleteTicketAdmin, updateTicketStatusAdmin, type TicketFilters } from "@/server/actions/admin/tickets";
import type { getAllTicketsAdmin } from "@/server/actions/admin/tickets";
import { formatDate } from "@/lib/utils/date";

type Ticket = Awaited<ReturnType<typeof getAllTicketsAdmin>>["tickets"][0];

interface TicketManagementPageProps {
  initialData: Awaited<ReturnType<typeof getAllTicketsAdmin>>;
}

const TICKET_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "PENDING", label: "Pending" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "UNRESOLVED", label: "Unresolved" },
];

const TICKET_PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const TICKET_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "QUESTION", label: "Question" },
  { value: "SUPPORT", label: "Support" },
  { value: "TASK", label: "Task" },
];

export function TicketManagementPage(props: TicketManagementPageProps) {
  return (
    <Suspense fallback={null}>
      <TicketManagementPageInner {...props} />
    </Suspense>
  );
}

function TicketManagementPageInner({ initialData }: TicketManagementPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filters: TicketFilters = {
    status: searchParams.get("status") || undefined,
    priority: searchParams.get("priority") || undefined,
    type: searchParams.get("type") || undefined,
    search: searchParams.get("search") || undefined,
    page: initialData.page,
  };

  const updateFilters = (newFilters: Partial<TicketFilters>) => {
    const updated = { ...filters, ...newFilters, page: 1 };
    const params = new URLSearchParams();
    if (updated.status) params.set("status", updated.status);
    if (updated.priority) params.set("priority", updated.priority);
    if (updated.type) params.set("type", updated.type);
    if (updated.search) params.set("search", updated.search);
    router.push(`/dashboard/admin/tickets?${params.toString()}`);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await deleteTicketAdmin(ticketId);
    setIsLoading(false);
    if (result.success) {
      setSuccess(result.message || "Ticket deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedTicket(null);
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 1000);
    } else {
      setError(result.error || "Failed to delete ticket");
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: string) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await updateTicketStatusAdmin(ticketId, status);
    setIsLoading(false);
    if (result.success) {
      setSuccess(result.message || "Ticket status updated successfully");
      setStatusDialogOpen(false);
      setSelectedTicket(null);
      setSelectedStatus("");
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 1000);
    } else {
      setError(result.error || "Failed to update ticket status");
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "OPEN":
        return "info";
      case "IN_PROGRESS":
        return "warning";
      case "PENDING":
        return "warning";
      case "RESOLVED":
        return "success";
      case "CLOSED":
        return "default";
      case "CANCELLED":
        return "error";
      default:
        return "default";
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case "LOW":
        return "default";
      case "MEDIUM":
        return "info";
      case "HIGH":
        return "warning";
      case "URGENT":
        return "error";
      default:
        return "default";
    }
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "BUG":
        return "error";
      case "FEATURE":
        return "success";
      case "QUESTION":
        return "info";
      case "SUPPORT":
        return "warning";
      case "TASK":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
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
            <div className="flex-1">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error-400 hover:text-error-600 dark:hover:text-error-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-success-400 hover:text-success-600 dark:hover:text-success-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Ticket Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage all tickets ({initialData.total} total)
          </p>
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {/* Menu Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Search"
              placeholder="Search tickets..."
              value={filters.search || ""}
              onChange={(e) => updateFilters({ search: e.target.value })}
            />
            <Select
              label="Status"
              options={TICKET_STATUS_OPTIONS}
              value={filters.status || ""}
              onChange={(e) => updateFilters({ status: e.target.value || undefined })}
            />
            <Select
              label="Priority"
              options={TICKET_PRIORITY_OPTIONS}
              value={filters.priority || ""}
              onChange={(e) => updateFilters({ priority: e.target.value || undefined })}
            />
            <Select
              label="Type"
              options={TICKET_TYPE_OPTIONS}
              value={filters.type || ""}
              onChange={(e) => updateFilters({ type: e.target.value || undefined })}
            />
          </div>
        </div>

        {/* Tickets Content */}
        {initialData.tickets.length === 0 ? (
          <div className="p-12 text-center">
            {(filters.search || filters.status || filters.priority || filters.type) ? (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No tickets found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No tickets match your search criteria.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    updateFilters({ search: undefined, status: undefined, priority: undefined, type: undefined });
                  }}
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
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
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No tickets yet
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  Tickets will appear here once they are created.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Ticket
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Comments
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {initialData.tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          {ticket.ticketNumber}
                        </Link>
                        <span className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-1 mt-1">
                          {ticket.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getTypeBadgeVariant(ticket.type)} size="sm">
                        {ticket.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(ticket.status)} size="sm">
                        {ticket.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getPriorityBadgeVariant(ticket.priority)} size="sm">
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-neutral-900 dark:text-neutral-100">
                          {ticket.createdBy?.name || ticket.createdByName || "Unknown"}
                        </span>
                        {ticket.createdBy?.email && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {ticket.createdBy.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.assignedTo ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-neutral-900 dark:text-neutral-100">
                            {ticket.assignedTo.name || "Unknown"}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {ticket.assignedTo.email}
                          </span>
                        </div>
                      ) : ticket.assignedToGroup ? (
                        <Badge variant="info" size="sm">
                          {ticket.assignedToGroup.name}
                        </Badge>
                      ) : (
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {ticket._count.comments}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(ticket.createdAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setSelectedStatus(ticket.status);
                            setStatusDialogOpen(true);
                          }}
                        >
                          Update Status
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {initialData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Page {initialData.page} of {initialData.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={initialData.page === 1}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("page", String(initialData.page - 1));
                  router.push(`/dashboard/admin/tickets?${params.toString()}`);
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={initialData.page === initialData.totalPages}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("page", String(initialData.page + 1));
                  router.push(`/dashboard/admin/tickets?${params.toString()}`);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Ticket Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Ticket"
        description={`Are you sure you want to delete ticket ${selectedTicket?.ticketNumber}?`}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg mb-4">
            <p className="text-sm text-error-700 dark:text-error-300">
              This will permanently delete the ticket. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => selectedTicket && handleDeleteTicket(selectedTicket.id)}
              disabled={isLoading}
              loading={isLoading}
            >
              Delete Ticket
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title="Update Ticket Status"
        description={`Update the status for ticket ${selectedTicket?.ticketNumber}`}
      >
        <div className="p-6 space-y-4">
          <Select
            label="Status"
            options={TICKET_STATUS_OPTIONS.filter((opt) => opt.value !== "" && opt.value !== "UNRESOLVED")}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          />
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => selectedTicket && selectedStatus && handleUpdateStatus(selectedTicket.id, selectedStatus)}
              disabled={isLoading || !selectedStatus}
              loading={isLoading}
            >
              Update Status
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
