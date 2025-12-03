"use client";

import React from "react";
import { Tabs } from "@/components/ui/Tabs";
import { formatUserName, formatUserInitial } from "@/lib/utils/users";
import { TicketActivity } from "../TicketActivity";
import { TicketCommentForm } from "../TicketCommentForm";
import { formatDuration } from "@/lib/utils/time-tracking";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  isAgentOnly: boolean;
  userId?: string | null;
  authorName?: string | null;
  user: {
    id: string;
    name?: string | null;
    email: string;
    role?: string | null;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  } | null;
}

interface TicketCommentsAndActivityProps {
  ticket: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    closedAt: Date | null;
    status: string;
    priority: string;
    createdById?: string | null;
    createdByName?: string | null;
    createdBy: {
      name?: string | null;
      email: string;
      status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
    } | null;
    assignedTo?: {
      name?: string | null;
      email: string;
      status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
    } | null;
    comments: Comment[];
    activities: Array<{
      id: string;
      activityType: string;
      changedById: string | null;
      changedByName: string | null;
      oldValue: string | null;
      newValue: string | null;
      metadata: any;
      createdAt: Date;
      changedBy: {
        id: string;
        name: string | null;
        email: string;
        status: string;
      } | null;
    }>;
  };
  userRole: string;
  stoppedTimeEntries?: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    startedAt: Date;
    totalDuration: number;
    lastResumedAt: Date | null;
    createdAt: Date;
  }>;
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getRoleBadge = (role: string) => {
  switch (role) {
    case "AGENT":
      return {
        label: "Agent",
        className: "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-800",
      };
    case "ADMIN":
      return {
        label: "Admin",
        className: "bg-error-100 dark:bg-error-900 text-error-700 dark:text-error-300 border-error-200 dark:border-error-800",
      };
    case "MODERATOR":
      return {
        label: "Moderator",
        className: "bg-secondary-100 dark:bg-secondary-900 text-secondary-700 dark:text-secondary-300 border-secondary-200 dark:border-secondary-800",
      };
    default:
      return null;
  }
};

export const TicketCommentsAndActivity = ({
  ticket,
  userRole,
  stoppedTimeEntries = [],
}: TicketCommentsAndActivityProps) => {
  const [mounted, setMounted] = React.useState(false);

  // Ensure component is mounted before formatting dates to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const commentsTabContent = (
    <div>
      {/* Comments List */}
      {ticket.comments.length === 0 ? (
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">No comments yet. Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-6 mb-8">
          {ticket.comments.map((comment) => (
            <div
              key={comment.id}
              className={`border-l-4 pl-4 py-2 rounded-r-lg ${
                comment.isAgentOnly
                  ? "border-orange-300 bg-orange-50 dark:bg-orange-900/20"
                  : "border-primary-200 dark:border-primary-800"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      comment.isAgentOnly ? "bg-orange-100 dark:bg-orange-900" : "bg-primary-100 dark:bg-primary-900"
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        comment.isAgentOnly ? "text-orange-700 dark:text-orange-300" : "text-primary-700 dark:text-primary-300"
                      }`}
                    >
                      {formatUserInitial(
                        comment.user
                          ? {
                              id: comment.user.id,
                              name: comment.user.name ?? null,
                              email: comment.user.email,
                              status: comment.user.status,
                            }
                          : null,
                        comment.authorName
                      )}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatUserName(
                          comment.user
                            ? {
                                id: comment.user.id,
                                name: comment.user.name ?? null,
                                email: comment.user.email,
                                status: comment.user.status,
                              }
                            : null,
                          comment.authorName
                        )}
                      </p>
                      {comment.isAgentOnly && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-800">
                          Agent Only
                        </span>
                      )}
                      {comment.user && comment.user.role && getRoleBadge(comment.user.role) && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadge(comment.user.role)?.className}`}
                        >
                          {getRoleBadge(comment.user.role)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      {mounted ? formatDate(comment.createdAt) : ""}
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap mt-2">
                {comment.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Comment Form */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <TicketCommentForm ticketId={ticket.id} userRole={userRole} />
      </div>
    </div>
  );

  const activityTabContent = (
    <div>
      <TicketActivity 
        key={`activity-${ticket.id}-v2`}
        ticket={{ activities: ticket.activities || [] }} 
      />
    </div>
  );

  const timersTabContent = (
    <div>
      {stoppedTimeEntries.length === 0 ? (
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3"
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
          <p className="text-neutral-600 dark:text-neutral-400">No stopped timers yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stoppedTimeEntries.map((entry) => {
            const statusColors = {
              STOPPED: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
              COMPLETED: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
            };
            const statusColor = statusColors[entry.status as keyof typeof statusColors] || statusColors.STOPPED;
            
            return (
              <div
                key={entry.id}
                className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        href={`${ROUTES.DASHBOARD}/time-tracking/${entry.id}`}
                        className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {entry.name}
                      </Link>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {entry.status}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {entry.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-500">
                      <span>Duration: {formatDuration(entry.totalDuration)}</span>
                      <span>
                        Started: {mounted ? new Date(entry.startedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const tabs = [
    {
      id: "comments",
      label: `Comments (${ticket.comments.length})`,
      content: commentsTabContent,
    },
    {
      id: "activity",
      label: "Activity",
      content: activityTabContent,
    },
    {
      id: "timers",
      label: `Timers (${stoppedTimeEntries.length})`,
      content: timersTabContent,
    },
  ];

  return <Tabs tabs={tabs} defaultTab="comments" />;
};
