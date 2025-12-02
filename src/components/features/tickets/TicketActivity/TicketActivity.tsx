"use client";

import React from "react";
import { formatUserName } from "@/lib/utils/users";
import { formatDate } from "./utils";

// Version: 2.0 - Timeline design with vertical line

type TicketActivityType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "TYPE_CHANGED"
  | "TITLE_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "ASSIGNED_TO_AGENT"
  | "UNASSIGNED_FROM_AGENT"
  | "ASSIGNED_TO_GROUP"
  | "UNASSIGNED_FROM_GROUP"
  | "TAGS_CHANGED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "COMMENT_ADDED"
  | "TIMER_CREATED"
  | "TIMER_ASSIGNED"
  | "TIMER_UNASSIGNED"
  | "TIMER_STARTED"
  | "TIMER_PAUSED"
  | "TIMER_RESUMED"
  | "TIMER_STOPPED";

interface TicketActivityProps {
  ticket: {
    activities: Array<{
      id: string;
      activityType: TicketActivityType;
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
}

const getActivityDescription = (activityType: TicketActivityType, oldValue: string | null, newValue: string | null): string => {
  switch (activityType) {
    case "CREATED":
      return "Ticket created";
    case "STATUS_CHANGED":
      return "Status changed";
    case "PRIORITY_CHANGED":
      return "Priority changed";
    case "TYPE_CHANGED":
      return "Type changed";
    case "TITLE_CHANGED":
      return "Title changed";
    case "DESCRIPTION_CHANGED":
      return "Description changed";
    case "ASSIGNED_TO_AGENT":
      return oldValue ? "Reassigned to agent" : "Assigned to agent";
    case "UNASSIGNED_FROM_AGENT":
      return "Unassigned from agent";
    case "ASSIGNED_TO_GROUP":
      return oldValue ? "Reassigned to group" : "Assigned to group";
    case "UNASSIGNED_FROM_GROUP":
      return "Unassigned from group";
    case "TAGS_CHANGED":
      return "Tags changed";
    case "RESOLVED":
      return "Ticket resolved";
    case "CLOSED":
      return "Ticket closed";
    case "REOPENED":
      return "Ticket reopened";
    case "COMMENT_ADDED":
      return "Comment added";
    case "TIMER_CREATED":
      return "Timer created";
    case "TIMER_ASSIGNED":
      return "Timer assigned";
    case "TIMER_UNASSIGNED":
      return "Timer unassigned";
    case "TIMER_STARTED":
      return "Timer started";
    case "TIMER_PAUSED":
      return "Timer paused";
    case "TIMER_RESUMED":
      return "Timer resumed";
    case "TIMER_STOPPED":
      return "Timer stopped";
    default:
      return "Activity";
  }
};

const formatValue = (value: string | null, activityType: TicketActivityType): string => {
  if (!value) return "";
  
  // Format status values
  if (activityType === "STATUS_CHANGED" || activityType === "REOPENED") {
    return value.replace(/_/g, " ");
  }
  
  return value;
};

export const TicketActivity = ({ ticket }: TicketActivityProps) => {
  const [mounted, setMounted] = React.useState(false);

  // Ensure component is mounted before formatting dates to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activities = ticket.activities || [];

  const getActivityIcon = (type: TicketActivityType) => {
    switch (type) {
      case "CREATED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case "STATUS_CHANGED":
      case "REOPENED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "PRIORITY_CHANGED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case "TYPE_CHANGED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
      case "TITLE_CHANGED":
      case "DESCRIPTION_CHANGED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case "ASSIGNED_TO_AGENT":
      case "UNASSIGNED_FROM_AGENT":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case "ASSIGNED_TO_GROUP":
      case "UNASSIGNED_FROM_GROUP":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case "TAGS_CHANGED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        );
      case "RESOLVED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "CLOSED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "COMMENT_ADDED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case "TIMER_CREATED":
      case "TIMER_ASSIGNED":
      case "TIMER_UNASSIGNED":
      case "TIMER_STARTED":
      case "TIMER_PAUSED":
      case "TIMER_RESUMED":
      case "TIMER_STOPPED":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

  const getActivityColor = (type: TicketActivityType) => {
    switch (type) {
      case "CREATED":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "STATUS_CHANGED":
      case "REOPENED":
        return "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300";
      case "PRIORITY_CHANGED":
        return "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300";
      case "TYPE_CHANGED":
        return "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300";
      case "TITLE_CHANGED":
      case "DESCRIPTION_CHANGED":
        return "bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300";
      case "ASSIGNED_TO_AGENT":
      case "UNASSIGNED_FROM_AGENT":
        return "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300";
      case "ASSIGNED_TO_GROUP":
      case "UNASSIGNED_FROM_GROUP":
        return "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300";
      case "TAGS_CHANGED":
        return "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300";
      case "RESOLVED":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "CLOSED":
        return "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300";
      case "COMMENT_ADDED":
        return "bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300";
      case "TIMER_CREATED":
      case "TIMER_ASSIGNED":
      case "TIMER_STARTED":
      case "TIMER_RESUMED":
        return "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300";
      case "TIMER_UNASSIGNED":
      case "TIMER_PAUSED":
        return "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300";
      case "TIMER_STOPPED":
        return "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300";
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
    <div className="relative pl-10" data-timeline-version="2.0">
      {/* Continuous vertical timeline line - positioned to align with icon centers */}
      {activities.length > 1 && (
        <>
          {/* Light mode line */}
          <div 
            className="absolute top-0 bottom-0 dark:hidden"
            style={{
              left: '19px', // Icon center at 20px, line is 2px wide, so left edge at 19px centers it
              width: '2px',
              backgroundColor: 'rgb(163 163 163)', // neutral-400
              zIndex: 0
            }}
          />
          {/* Dark mode line */}
          <div 
            className="absolute top-0 bottom-0 hidden dark:block"
            style={{
              left: '19px', // Icon center at 20px, line is 2px wide, so left edge at 19px centers it
              width: '2px',
              backgroundColor: 'rgb(115 115 115)', // neutral-500
              zIndex: 0
            }}
          />
        </>
      )}
      
      <div className="relative">
        {activities.map((activity, index) => {
          const description = getActivityDescription(activity.activityType, activity.oldValue, activity.newValue);
          const showChangeDetails = activity.oldValue && activity.newValue && 
            (activity.activityType === "STATUS_CHANGED" || 
             activity.activityType === "PRIORITY_CHANGED" || 
             activity.activityType === "TYPE_CHANGED" ||
             activity.activityType === "TITLE_CHANGED" ||
             activity.activityType === "DESCRIPTION_CHANGED" ||
             activity.activityType === "TAGS_CHANGED" ||
             activity.activityType === "ASSIGNED_TO_AGENT" ||
             activity.activityType === "ASSIGNED_TO_GROUP" ||
             activity.activityType === "REOPENED" ||
             activity.activityType === "TIMER_PAUSED" ||
             activity.activityType === "TIMER_RESUMED" ||
             activity.activityType === "TIMER_STOPPED");
          
          const showSingleValue = (activity.activityType === "ASSIGNED_TO_AGENT" && !activity.oldValue) ||
            (activity.activityType === "ASSIGNED_TO_GROUP" && !activity.oldValue) ||
            (activity.activityType === "UNASSIGNED_FROM_AGENT") ||
            (activity.activityType === "UNASSIGNED_FROM_GROUP") ||
            activity.activityType === "TIMER_CREATED" ||
            activity.activityType === "TIMER_STARTED";
          
          const showTimerName = activity.metadata?.timerName && 
            (activity.activityType === "TIMER_CREATED" ||
             activity.activityType === "TIMER_ASSIGNED" ||
             activity.activityType === "TIMER_UNASSIGNED" ||
             activity.activityType === "TIMER_STARTED" ||
             activity.activityType === "TIMER_PAUSED" ||
             activity.activityType === "TIMER_RESUMED" ||
             activity.activityType === "TIMER_STOPPED");

          return (
            <div
              key={activity.id}
              className="relative flex items-start gap-4 mb-8 last:mb-0"
            >
              {/* Timeline node - icon positioned on the line */}
              <div className="relative z-10 flex-shrink-0" style={{ marginLeft: '-2.5rem' }}>
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-md ${getActivityColor(activity.activityType)}`}
                >
                  {getActivityIcon(activity.activityType)}
                </div>
              </div>
              
              {/* Content card */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {description}
                      </p>
                      {(activity.changedBy || activity.changedByName) && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          by {formatUserName(activity.changedBy, activity.changedByName)}
                        </p>
                      )}
                      {showChangeDetails && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Changed from <span className="font-medium">{formatValue(activity.oldValue, activity.activityType)}</span> to{" "}
                          <span className="font-medium">{formatValue(activity.newValue, activity.activityType)}</span>
                        </p>
                      )}
                      {showSingleValue && activity.newValue && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          {activity.activityType === "UNASSIGNED_FROM_AGENT" || activity.activityType === "UNASSIGNED_FROM_GROUP"
                            ? `Removed: ${activity.oldValue}`
                            : `Assigned: ${activity.newValue}`}
                        </p>
                      )}
                      {showSingleValue && !activity.newValue && activity.oldValue && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Removed: {activity.oldValue}
                        </p>
                      )}
                      {showTimerName && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Timer: <span className="font-medium">{activity.metadata.timerName}</span>
                        </p>
                      )}
                      {activity.activityType === "TIMER_STOPPED" && activity.metadata?.totalDuration && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Total duration: {formatDuration(activity.metadata.totalDuration)}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 whitespace-nowrap">
                      {mounted ? formatDate(activity.createdAt) : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper function to format duration for display
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};
