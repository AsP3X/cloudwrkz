import React from "react";
import { formatUserName } from "@/lib/utils/users";
import { formatDate } from "./utils";

interface ActivityItem {
  id: string;
  type: "created" | "status_changed" | "priority_changed" | "assigned" | "resolved" | "closed" | "comment";
  description: string;
  user?: {
    name?: string | null;
    email: string;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  };
  storedName?: string | null;
  timestamp: Date;
  metadata?: {
    oldValue?: string;
    newValue?: string;
  };
}

interface TicketActivityProps {
  ticket: {
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
    comments: Array<{
      id: string;
      createdAt: Date;
      userId?: string | null;
      authorName?: string | null;
      user: {
        name?: string | null;
        email: string;
        status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
      } | null;
    }>;
  };
}

export const TicketActivity = ({ ticket }: TicketActivityProps) => {
  const activities: ActivityItem[] = [];

  // Ticket creation
  activities.push({
    id: "ticket-created",
    type: "created",
    description: "Ticket created",
    user: ticket.createdBy || undefined,
    storedName: ticket.createdByName || undefined,
    timestamp: ticket.createdAt,
  });

  // Status changes (inferred from timestamps)
  if (ticket.resolvedAt) {
    activities.push({
      id: "ticket-resolved",
      type: "resolved",
      description: "Ticket resolved",
      timestamp: ticket.resolvedAt,
    });
  }

  if (ticket.closedAt) {
    activities.push({
      id: "ticket-closed",
      type: "closed",
      description: "Ticket closed",
      timestamp: ticket.closedAt,
    });
  }

  // Comments
  ticket.comments.forEach((comment) => {
    activities.push({
      id: `comment-${comment.id}`,
      type: "comment",
      description: "Comment added",
      user: comment.user || undefined,
      storedName: comment.authorName || undefined,
      timestamp: comment.createdAt,
    });
  });

  // Sort by timestamp descending (newest first)
  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "created":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case "status_changed":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "priority_changed":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case "assigned":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case "resolved":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "closed":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "comment":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getActivityColor = (type: ActivityItem["type"]) => {
    switch (type) {
      case "created":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "status_changed":
        return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
      case "priority_changed":
        return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
      case "assigned":
        return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
      case "resolved":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "closed":
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
      case "comment":
        return "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300";
      default:
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
    }
  };

  if (activities.length === 0) {
    return (
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
        <p className="text-neutral-600 dark:text-neutral-400">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-start gap-4 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
        >
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getActivityColor(activity.type)}`}>
            {getActivityIcon(activity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {activity.description}
                </p>
                {(activity.user || activity.storedName) && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    by {formatUserName(activity.user, activity.storedName)}
                  </p>
                )}
                {activity.metadata?.oldValue && activity.metadata?.newValue && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    Changed from <span className="font-medium">{activity.metadata.oldValue}</span> to{" "}
                    <span className="font-medium">{activity.metadata.newValue}</span>
                  </p>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 whitespace-nowrap">
                {formatDate(activity.timestamp)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
