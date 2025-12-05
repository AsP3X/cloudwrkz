"use client";

import React from "react";
import type { getProject } from "@/server/actions/projects";
import type { getProjectAnalytics } from "@/server/actions/project-analytics";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Analytics = NonNullable<Awaited<ReturnType<typeof getProjectAnalytics>>>;

interface ProjectAnalyticsTabProps {
  project: Project;
  analytics: Analytics;
}

export function ProjectAnalyticsTab({ project, analytics }: ProjectAnalyticsTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Analytics & Reports</h3>
        <div className="space-y-6">
          {/* Progress Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Progress by Milestone</h4>
            <div className="space-y-3">
              {analytics.progress.byMilestone.map((milestone) => (
                <div key={milestone.milestoneId}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">{milestone.milestoneName}</span>
                    <span className="text-sm font-medium">{milestone.progress.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${milestone.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Budget Breakdown */}
          {analytics.budget.byCategory.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">Budget by Category</h4>
              <div className="space-y-3">
                {analytics.budget.byCategory.map((category) => (
                  <div key={category.categoryId}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">{category.categoryName}</span>
                      <span className="text-sm font-medium">
                        ${category.spent.toFixed(2)} / ${category.budgeted.toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
                      <div
                        className={
                          category.spent > category.budgeted
                            ? "bg-red-500 h-2 rounded-full"
                            : "bg-green-500 h-2 rounded-full"
                        }
                        style={{
                          width: `${Math.min(100, (category.spent / category.budgeted) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time Tracking Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Time Tracking by Ticket</h4>
            <div className="space-y-2">
              {analytics.timeTracking.byTicket.slice(0, 10).map((ticket) => (
                <div key={ticket.ticketId} className="flex justify-between text-sm">
                  <span className="truncate">{ticket.ticketTitle}</span>
                  <span className="font-medium ml-2">
                    {ticket.actual.toFixed(1)}h / {ticket.planned.toFixed(1)}h
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ticket Creation Trend */}
          {analytics.tickets.createdTrend.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">Ticket Creation Trend (Last 30 Days)</h4>
              <div className="space-y-1">
                {analytics.tickets.createdTrend.map((trend) => (
                  <div key={trend.date} className="flex justify-between text-sm">
                    <span>{new Date(trend.date).toLocaleDateString()}</span>
                    <span className="font-medium">{trend.count} tickets</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Reports */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Export Reports</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Generate and download project reports in various formats.
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
            Export PDF
          </button>
          <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}
