import { formatUserName } from "@/lib/utils/users";
import { formatDateTime } from "@/lib/utils/date";
import type { TicketActivity as ActivityItem } from "@/lib/types";

function getActivityDescription(
  activityType: string,
  oldValue: string | null | undefined,
  _newValue: string | null | undefined
): string {
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
    case "MERGED_FROM_TICKET":
      return "Ticket merged from another ticket";
    case "MERGED_INTO_TICKET":
      return "Ticket merged into another ticket";
    default:
      return "Activity";
  }
}

function formatValue(value: string | null | undefined, activityType: string): string {
  if (!value) return "";
  if (
    activityType === "STATUS_CHANGED" ||
    activityType === "REOPENED"
  ) {
    return value.replace(/_/g, " ");
  }
  return value;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export interface TicketActivityProps {
  activities: ActivityItem[];
}

export function TicketActivity({ activities }: TicketActivityProps) {
  const getActivityIcon = (type: string) => {
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
      case "MERGED_FROM_TICKET":
      case "MERGED_INTO_TICKET":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-2 8l4-4H9l4-4" />
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

  const getActivityColor = (type: string): string => {
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
      case "MERGED_FROM_TICKET":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "MERGED_INTO_TICKET":
        return "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300";
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-neutral-600 dark:text-neutral-400">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-10" data-timeline-version="2.0">
      {activities.length > 1 && (
        <>
          <div
            className="absolute top-0 bottom-0 dark:hidden"
            style={{
              left: "19px",
              width: "2px",
              backgroundColor: "rgb(163 163 163)",
              zIndex: 0,
            }}
          />
          <div
            className="absolute top-0 bottom-0 hidden dark:block"
            style={{
              left: "19px",
              width: "2px",
              backgroundColor: "rgb(115 115 115)",
              zIndex: 0,
            }}
          />
        </>
      )}
      <div className="relative">
        {activities.map((activity) => {
          const description = getActivityDescription(
            activity.activity_type,
            activity.old_value ?? null,
            activity.new_value ?? null
          );
          const showChangeDetails =
            activity.old_value &&
            activity.new_value &&
            [
              "STATUS_CHANGED",
              "PRIORITY_CHANGED",
              "TYPE_CHANGED",
              "TITLE_CHANGED",
              "DESCRIPTION_CHANGED",
              "TAGS_CHANGED",
              "ASSIGNED_TO_AGENT",
              "ASSIGNED_TO_GROUP",
              "REOPENED",
              "TIMER_PAUSED",
              "TIMER_RESUMED",
              "TIMER_STOPPED",
            ].includes(activity.activity_type);
          const showSingleValue =
            (activity.activity_type === "ASSIGNED_TO_AGENT" && !activity.old_value) ||
            (activity.activity_type === "ASSIGNED_TO_GROUP" && !activity.old_value) ||
            activity.activity_type === "UNASSIGNED_FROM_AGENT" ||
            activity.activity_type === "UNASSIGNED_FROM_GROUP" ||
            activity.activity_type === "TIMER_CREATED" ||
            activity.activity_type === "TIMER_STARTED";
          type MetaDisplay = Record<string, string | number | boolean | undefined>;
          const meta = activity.metadata as MetaDisplay | undefined;
          const showTimerName =
            meta?.timerName &&
            [
              "TIMER_CREATED",
              "TIMER_ASSIGNED",
              "TIMER_UNASSIGNED",
              "TIMER_STARTED",
              "TIMER_PAUSED",
              "TIMER_RESUMED",
              "TIMER_STOPPED",
            ].includes(activity.activity_type);
          const totalDuration = typeof meta?.totalDuration === "number" ? meta.totalDuration : undefined;

          return (
            <div key={activity.id} className="relative flex items-start gap-4 mb-8 last:mb-0">
              <div className="relative z-10 flex-shrink-0" style={{ marginLeft: "-2.5rem" }}>
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-white dark:border-neutral-900 shadow-md ${getActivityColor(activity.activity_type)}`}
                >
                  {getActivityIcon(activity.activity_type)}
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {description}
                      </p>
                      {(activity.changed_by || activity.changed_by_name) && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          by{" "}
                          {formatUserName(
                            activity.changed_by ?? null,
                            activity.changed_by_name ?? undefined
                          )}
                        </p>
                      )}
                      {showChangeDetails && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Changed from{" "}
                          <span className="font-medium">
                            {formatValue(activity.old_value ?? null, activity.activity_type)}
                          </span>{" "}
                          to{" "}
                          <span className="font-medium">
                            {formatValue(activity.new_value ?? null, activity.activity_type)}
                          </span>
                        </p>
                      )}
                      {showSingleValue && activity.new_value && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          {activity.activity_type === "UNASSIGNED_FROM_AGENT" ||
                          activity.activity_type === "UNASSIGNED_FROM_GROUP"
                            ? `Removed: ${activity.old_value ?? ""}`
                            : `Assigned: ${activity.new_value}`}
                        </p>
                      )}
                      {showSingleValue && !activity.new_value && activity.old_value && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Removed: {activity.old_value}
                        </p>
                      )}
                      {showTimerName && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Timer: <span className="font-medium">{meta?.timerName != null ? String(meta.timerName) : ""}</span>
                        </p>
                      )}
                      {activity.activity_type === "TIMER_STOPPED" && totalDuration != null && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                          Total duration: {formatDuration(totalDuration)}
                        </p>
                      )}
                      {activity.activity_type === "MERGED_FROM_TICKET" && meta && (
                        <div className="mt-3 rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            Merged ticket summary
                          </p>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400">
                            <span className="font-medium">Ticket:</span>{" "}
                            {String(meta.sourceTicketNumber ?? activity.merged_from_ticket_number ?? activity.new_value ?? "")}
                          </p>
                          {meta.sourceTitle != null && (
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              <span className="font-medium">Title:</span> {String(meta.sourceTitle)}
                            </p>
                          )}
                          {meta.sourceCreatedBy != null && (
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              <span className="font-medium">Created by:</span> {String(meta.sourceCreatedBy)}
                            </p>
                          )}
                          {meta.sourceDescription != null && (
                            <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3">
                              <span className="font-medium">Description:</span> {String(meta.sourceDescription)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 min-w-[120px]">
                      <p className="text-xs text-neutral-500 dark:text-neutral-500 whitespace-nowrap">
                        {formatDateTime(activity.created_at)}
                      </p>
                      {activity.merged_from_ticket_number && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                          Merged from {activity.merged_from_ticket_number}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
