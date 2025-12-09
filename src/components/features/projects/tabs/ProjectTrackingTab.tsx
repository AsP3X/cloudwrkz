"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";
import type { getProject } from "@/server/actions/projects";
import type { getProjectAnalytics } from "@/server/actions/project-analytics";
import { cn } from "@/lib/utils/cn";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Analytics = NonNullable<Awaited<ReturnType<typeof getProjectAnalytics>>>;

interface ProjectTrackingTabProps {
  project: Project;
  analytics: Analytics;
}

export function ProjectTrackingTab({ project, analytics }: ProjectTrackingTabProps) {
  return (
    <div className="space-y-6">
      {/* Progress Tracking */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Progress Tracking</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm font-bold">{analytics.progress.overall.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4">
              <div
                className="bg-primary-600 h-4 rounded-full transition-all"
                style={{ width: `${analytics.progress.overall}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {Object.entries(analytics.progress.byStatus).map(([status, count]) => (
              <div key={status} className="text-center">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  {status.replace("_", " ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Time Tracking */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Time Tracking</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Planned</div>
              <div className="text-2xl font-bold">{analytics.timeTracking.totalPlanned.toFixed(1)}h</div>
            </div>
            <div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Actual</div>
              <div className="text-2xl font-bold">{analytics.timeTracking.totalActual.toFixed(1)}h</div>
            </div>
          </div>
          {analytics.timeTracking.totalPlanned > 0 && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Time Usage</span>
                <span className="text-sm font-bold">
                  {((analytics.timeTracking.totalActual / analytics.timeTracking.totalPlanned) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4">
                <div
                  className={cn(
                    "h-4 rounded-full transition-all",
                    analytics.timeTracking.totalActual / analytics.timeTracking.totalPlanned > 1.1
                      ? "bg-red-500"
                      : analytics.timeTracking.totalActual / analytics.timeTracking.totalPlanned > 0.9
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      (analytics.timeTracking.totalActual / analytics.timeTracking.totalPlanned) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">By Team Member</h4>
            <div className="space-y-2">
              {analytics.timeTracking.byMember.map((member) => (
                <div key={member.userId} className="flex items-center justify-between">
                  <span className="text-sm">{member.userName}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {member.planned.toFixed(1)}h planned
                    </span>
                    <span className="font-medium">{member.actual.toFixed(1)}h actual</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Budget Tracking */}
      {project.budget && (
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold mb-4">Budget Tracking</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Budget</div>
                <div className="text-2xl font-bold">${analytics.budget.totalBudget.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Spent</div>
                <div className="text-2xl font-bold">${analytics.budget.spent.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Remaining</div>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    analytics.budget.remaining < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  ${analytics.budget.remaining.toFixed(2)}
                </div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Budget Usage</span>
                <span className="text-sm font-bold">
                  {((analytics.budget.spent / analytics.budget.totalBudget) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4">
                <div
                  className={cn(
                    "h-4 rounded-full transition-all",
                    analytics.budget.spent / analytics.budget.totalBudget > 0.9
                      ? "bg-red-500"
                      : analytics.budget.spent / analytics.budget.totalBudget > 0.7
                      ? "bg-yellow-500"
                      : "bg-green-500"
                  )}
                  style={{
                    width: `${Math.min(
                      100,
                      (analytics.budget.spent / analytics.budget.totalBudget) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Burn Rate</div>
                <div className="text-lg font-semibold">${analytics.budget.burnRate.toFixed(2)}/day</div>
              </div>
              <div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">Forecasted</div>
                <div className="text-lg font-semibold">${analytics.budget.forecasted.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Performance */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Team Performance</h3>
        <div className="space-y-3">
          {analytics.team.workload.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
            >
              <div>
                <div className="font-medium">{member.userName}</div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  {member.completedTasks} / {member.assignedTasks} tasks completed
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{member.timeSpent.toFixed(1)}h</div>
                <div className="text-xs text-neutral-500">
                  {((member.timeSpent / member.capacity) * 100).toFixed(0)}% capacity
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ticket Analytics */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Ticket Analytics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Tickets</div>
            <div className="text-2xl font-bold">{analytics.tickets.total}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Avg Resolution</div>
            <div className="text-2xl font-bold">{analytics.tickets.averageResolutionTime.toFixed(1)}h</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-2">By Status</h4>
            <div className="space-y-1">
              {Object.entries(analytics.tickets.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <span>{status.replace("_", " ")}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">By Priority</h4>
            <div className="space-y-1">
              {Object.entries(analytics.tickets.byPriority).map(([priority, count]) => (
                <div key={priority} className="flex justify-between text-sm">
                  <span>{priority}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
