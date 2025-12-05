"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { getProject, getProjectTickets, getProjectTimeAllocation } from "@/server/actions/projects";
import { updateTicket } from "@/server/actions/tickets";
import { formatDate, formatDateTimeFull } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Ticket = NonNullable<Awaited<ReturnType<typeof getProjectTickets>>>[0];
type TimeAllocation = NonNullable<Awaited<ReturnType<typeof getProjectTimeAllocation>>>[0];

interface ProjectDetailPageProps {
  project: Project;
  initialTickets?: Ticket[];
  initialTimeAllocation?: TimeAllocation[];
}

type ProjectViewMode = "list" | "card" | "kanban" | "timeline";

const VIEW_MODE_STORAGE_KEY = "project-detail-view-mode";

const TICKET_STATUSES = [
  { value: "OPEN", label: "Open", color: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200" },
  { value: "PENDING", label: "Pending", color: "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200" },
  { value: "RESOLVED", label: "Resolved", color: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200" },
  { value: "CLOSED", label: "Closed", color: "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200" },
  { value: "CANCELLED", label: "Cancelled", color: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200" },
];

export function ProjectDetailPage({ project, initialTickets = [], initialTimeAllocation = [] }: ProjectDetailPageProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ProjectViewMode>("list");
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [timeAllocation, setTimeAllocation] = useState<TimeAllocation[]>(initialTimeAllocation);
  const [draggedTicket, setDraggedTicket] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load view mode from localStorage (only allow list)
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored && stored === "list") {
        setViewMode("list");
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }, []);

  const handleViewModeChange = (mode: ProjectViewMode) => {
    if (mode === "card" || mode === "kanban" || mode === "timeline") return; // Card, Kanban, and Timeline views are disabled
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
      // Ignore localStorage errors
    }
  };

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    setDraggedTicket(ticketId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!draggedTicket) return;

    const ticket = tickets.find((t) => t.id === draggedTicket);
    if (!ticket || ticket.status === targetStatus) {
      setDraggedTicket(null);
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updateTicket(draggedTicket, { status: targetStatus as any });
      if (result.success) {
        // Update local state
        setTickets((prev) =>
          prev.map((t) => (t.id === draggedTicket ? { ...t, status: targetStatus as any } : t))
        );
        router.refresh();
      }
    } catch (error) {
      console.error("Error updating ticket status:", error);
    } finally {
      setIsUpdating(false);
      setDraggedTicket(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "PLANNING":
        return "info";
      case "ACTIVE":
        return "success";
      case "ON_HOLD":
        return "warning";
      case "COMPLETED":
        return "default";
      case "CANCELLED":
        return "error";
      case "ARCHIVED":
        return "default";
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

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const managers = project.members.filter((m) => m.role === "MANAGER");
  const members = project.members.filter((m) => m.role === "MEMBER");
  
  // Determine if user is owner/manager or just a member
  const isOwnerOrManager = project.userRole === "OWNER" || project.userRole === "MANAGER";
  const isMember = project.userRole === "MEMBER";

  // Group tickets by status for Kanban
  const ticketsByStatus = TICKET_STATUSES.reduce((acc, status) => {
    acc[status.value] = tickets.filter((t) => t.status === status.value);
    return acc;
  }, {} as Record<string, Ticket[]>);

  // For members, show different views with tickets and time entries
  if (isMember) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link href="/dashboard/projects" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
            ← Back to Projects
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {project.color && (
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
              )}
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                {project.name}
              </h1>
              <Badge variant={getStatusBadgeVariant(project.status)} size="md">
                {project.status.replace("_", " ")}
              </Badge>
              <Badge variant={getPriorityBadgeVariant(project.priority)} size="md">
                {project.priority}
              </Badge>
            </div>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-mono text-sm">
            {project.code}
          </p>
          {project.description && (
            <p className="text-neutral-600 dark:text-neutral-400 mt-2">{project.description}</p>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="inline-flex rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1" role="group" aria-label="Project view options">
            <button
              type="button"
              onClick={() => handleViewModeChange("list")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                viewMode === "list"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="hidden sm:inline">Project Overview</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("card")}
              disabled
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "opacity-50 cursor-not-allowed",
                "text-neutral-400 dark:text-neutral-600"
              )}
              title="Card view coming soon"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="hidden sm:inline">Card</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("kanban")}
              disabled
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "opacity-50 cursor-not-allowed",
                "text-neutral-400 dark:text-neutral-600"
              )}
              title="Kanban view coming soon"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("timeline")}
              disabled
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "opacity-50 cursor-not-allowed",
                "text-neutral-400 dark:text-neutral-600"
              )}
              title="Timeline view coming soon"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Timeline</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
              {project._count.tickets}
            </p>
          </div>
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Time Entries</p>
            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
              {project._count.timeEntries}
            </p>
          </div>
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Members</p>
            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
              {project.members.length}
            </p>
          </div>
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Groups</p>
            <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
              {project.groups.length}
            </p>
          </div>
        </div>

        {/* View Content */}
        {viewMode === "card" && (
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Card View Coming Soon
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              The card view for project information will be available in a future update.
            </p>
          </div>
        )}

        {viewMode === "list" && (
          <div className="space-y-6">
            {/* Project Details */}
            <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Status</p>
                  <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                    {project.status.replace("_", " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Priority</p>
                  <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                    {project.priority}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Client</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">{project.client || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Budget</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {project.budget ? `$${project.budget.toLocaleString()}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Start Date</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {project.startDate && mounted ? formatDate(project.startDate) : project.startDate ? "" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">End Date</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {project.endDate && mounted ? formatDate(project.endDate) : project.endDate ? "" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Project Code</p>
                  <p className="text-base font-mono text-neutral-900 dark:text-neutral-100">{project.code}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Created By</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {project.createdBy?.name || project.createdBy?.email || "—"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Description</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {project.description || "No description provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Created At</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {mounted ? formatDateTimeFull(project.createdAt) : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">Last Updated</p>
                  <p className="text-base text-neutral-900 dark:text-neutral-100">
                    {mounted ? formatDateTimeFull(project.updatedAt) : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Project Team */}
            <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Team</h2>
              
              {managers.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Managers ({managers.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {managers.map((membership) => (
                      <div
                        key={membership.id}
                        className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">
                            {membership.user.name || membership.user.email}
                          </p>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                        </div>
                        <Badge variant="info" size="sm">Manager</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {members.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">Members ({members.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {members.map((membership) => (
                      <div
                        key={membership.id}
                        className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">
                            {membership.user.name || membership.user.email}
                          </p>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                        </div>
                        <Badge variant="default" size="sm">Member</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {managers.length === 0 && members.length === 0 && (
                <p className="text-neutral-500 dark:text-neutral-400 text-center py-4">No team members assigned</p>
              )}
            </div>

            {/* Project Groups */}
            {project.groups.length > 0 && (
              <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Groups ({project.groups.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {project.groups.map((projectGroup) => (
                    <div
                      key={projectGroup.id}
                      className="flex items-center gap-3 p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">
                          {projectGroup.group.name}
                        </p>
                        {projectGroup.group.description && (
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            {projectGroup.group.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="info" size="sm">Group</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Tickets */}
            {tickets.length > 0 && (
              <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                  Recent Tickets ({tickets.length} total)
                </h2>
                <div className="space-y-3">
                  {tickets.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">{ticket.title}</p>
                          <Badge variant={getPriorityBadgeVariant(ticket.priority)} size="sm">
                            {ticket.priority}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
                          <span className="font-mono">{ticket.ticketNumber}</span>
                          <span>•</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            ticket.status === "OPEN" && "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
                            ticket.status === "IN_PROGRESS" && "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200",
                            ticket.status === "PENDING" && "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200",
                            ticket.status === "RESOLVED" && "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
                            ticket.status === "CLOSED" && "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200",
                            ticket.status === "CANCELLED" && "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                          )}>
                            {ticket.status.replace("_", " ")}
                          </span>
                          {ticket.assignedTo && (
                            <>
                              <span>•</span>
                              <span>{ticket.assignedTo.name || ticket.assignedTo.email}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {tickets.length > 5 && (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center pt-2">
                      Showing 5 of {tickets.length} tickets
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Time Allocation Summary */}
            {timeAllocation.length > 0 && (
              <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Time Allocation Summary</h2>
                <div className="space-y-4">
                  {timeAllocation.slice(0, 5).map((allocation) => (
                    <div
                      key={`${allocation.userId}-${allocation.ticketId || "no-ticket"}`}
                      className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">
                          {allocation.userName}
                        </p>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          {allocation.ticketTitle || "No Ticket"} {allocation.ticketNumber && `(${allocation.ticketNumber})`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {formatDuration(allocation.totalDuration)}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {allocation.entries.length} {allocation.entries.length === 1 ? "entry" : "entries"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {timeAllocation.length > 5 && (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center pt-2">
                      Showing 5 of {timeAllocation.length} allocations
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === "kanban" && (
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Kanban View Coming Soon
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              The Kanban view with drag and drop functionality for project todos will be available in a future update.
            </p>
          </div>
        )}

        {viewMode === "timeline" && (
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12 text-center">
            <svg
              className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Timeline View Coming Soon
            </h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              The timeline view for time allocation planning will be available in a future update.
            </p>
          </div>
        )}

        {/* Project Managers */}
        {managers.length > 0 && (
          <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Managers</h2>
            <div className="space-y-3">
              {managers.map((membership) => (
                <div
                  key={membership.id}
                  className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {membership.user.name || membership.user.email}
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                  </div>
                  <Badge variant="info" size="sm">Manager</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Owner/Manager view - use the new comprehensive ProjectOwnerPage
  // This will be handled by the page component, so we don't render it here
  return null;
  
  // Old owner/manager view (kept for reference, but not used)
  const oldOwnerView = (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/projects" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
          ← Back to Projects
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          {project.color && (
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
          )}
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            {project.name}
          </h1>
          <Badge variant={getStatusBadgeVariant(project.status)} size="md">
            {project.status.replace("_", " ")}
          </Badge>
          <Badge variant={getPriorityBadgeVariant(project.priority)} size="md">
            {project.priority}
          </Badge>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-mono text-sm">
          {project.code}
        </p>
        {project.description && (
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">{project.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project._count.tickets}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Time Entries</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project._count.timeEntries}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Members</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project.members.length}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Groups</p>
          <p className="text-3xl font-bold text-neutral-100 mt-2">
            {project.groups.length}
          </p>
        </div>
      </div>

      {/* Project Details */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Status</p>
            <div className="mt-1">
              <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                {project.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Priority</p>
            <div className="mt-1">
              <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                {project.priority}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Client</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.client || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Budget</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.budget ? `$${project.budget.toLocaleString()}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Start Date</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.startDate && mounted ? formatDate(project.startDate) : project.startDate ? "" : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">End Date</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.endDate && mounted ? formatDate(project.endDate) : project.endDate ? "" : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created By</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.createdBy?.name || project.createdBy?.email || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created At</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {mounted ? formatDateTimeFull(project.createdAt) : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Project Managers */}
      {managers.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Managers</h2>
          <div className="space-y-3">
            {managers.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {membership.user.name || membership.user.email}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                </div>
                <Badge variant="info" size="sm">Manager</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Members */}
      {members.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Members</h2>
          <div className="space-y-3">
            {members.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {membership.user.name || membership.user.email}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                </div>
                <Badge variant="default" size="sm">Member</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Groups */}
      {project.groups.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Groups</h2>
          <div className="space-y-3">
            {project.groups.map((projectGroup) => (
              <div
                key={projectGroup.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {projectGroup.group.name}
                  </p>
                  {projectGroup.group.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {projectGroup.group.description}
                    </p>
                  )}
                </div>
                <Badge variant="info" size="sm">Group</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
