"use client";

import React from "react";
import { Tabs } from "@/components/ui/Tabs";
import { formatUserName, formatUserInitial } from "@/lib/utils/users";
import { TicketActivity } from "../TicketActivity";
import { TicketCommentForm } from "../TicketCommentForm";

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  isAgentOnly: boolean;
  user: {
    id: string;
    name?: string | null;
    email: string;
    role?: string | null;
    status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  };
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
    createdBy: {
      name?: string | null;
      email: string;
      status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
    };
    assignedTo?: {
      name?: string | null;
      email: string;
      status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
    } | null;
    comments: Comment[];
  };
  userRole: string;
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
}: TicketCommentsAndActivityProps) => {
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
                      {formatUserInitial(comment.user)}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatUserName(comment.user)}
                      </p>
                      {comment.isAgentOnly && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-800">
                          Agent Only
                        </span>
                      )}
                      {comment.user.role && getRoleBadge(comment.user.role) && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadge(comment.user.role)?.className}`}
                        >
                          {getRoleBadge(comment.user.role)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500">
                      {formatDate(comment.createdAt)}
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
      <TicketActivity ticket={ticket} />
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
  ];

  return <Tabs tabs={tabs} defaultTab="comments" />;
};
