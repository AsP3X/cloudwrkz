"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { getProject } from "@/server/actions/projects";
import type { getProjectAnalytics } from "@/server/actions/project-analytics";
import { formatDate, formatDateTimeFull } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Analytics = NonNullable<Awaited<ReturnType<typeof getProjectAnalytics>>>;

interface ProjectOverviewTabProps {
  project: Project;
  analytics: Analytics;
}

export function ProjectOverviewTab({ project, analytics }: ProjectOverviewTabProps) {
  const healthScore = calculateHealthScore(analytics);

  return (
    <div className="space-y-6">
      {/* Project Health Score */}
      <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-xl p-6 border border-primary-200 dark:border-primary-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
              Project Health Score
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Overall project status and performance
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-primary-600 dark:text-primary-400">
              {healthScore}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">/ 100</div>
          </div>
        </div>
        <div className="mt-4 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              healthScore >= 80
                ? "bg-green-500"
                : healthScore >= 60
                ? "bg-yellow-500"
                : "bg-red-500"
            )}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Progress */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Overall Progress
            </h4>
            <Badge variant="info" size="sm">
              {analytics.progress.overall.toFixed(1)}%
            </Badge>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${analytics.progress.overall}%` }}
            />
          </div>
        </div>

        {/* Budget */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Budget Status
            </h4>
            <Badge
              variant={
                project.budget && analytics.budget.spent / project.budget > 0.9
                  ? "error"
                  : project.budget && analytics.budget.spent / project.budget > 0.7
                  ? "warning"
                  : "success"
              }
              size="sm"
            >
              {project.budget
                ? `$${analytics.budget.spent.toFixed(0)} / $${project.budget.toFixed(0)}`
                : "No Budget"}
            </Badge>
          </div>
          {project.budget && (
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3">
              <div
                className={cn(
                  "h-3 rounded-full transition-all",
                  analytics.budget.spent / project.budget > 0.9
                    ? "bg-red-500"
                    : analytics.budget.spent / project.budget > 0.7
                    ? "bg-yellow-500"
                    : "bg-green-500"
                )}
                style={{
                  width: `${Math.min(100, (analytics.budget.spent / project.budget) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Time Tracking */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Time Tracking
            </h4>
            <Badge variant="info" size="sm">
              {analytics.timeTracking.totalActual.toFixed(0)}h /{" "}
              {analytics.timeTracking.totalPlanned.toFixed(0)}h
            </Badge>
          </div>
          {analytics.timeTracking.totalPlanned > 0 && (
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3">
              <div
                className={cn(
                  "h-3 rounded-full transition-all",
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
          )}
        </div>

        {/* Tickets */}
        <Link
          href={`/dashboard/tickets?projectId=${project.id}`}
          className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all cursor-pointer block"
        >
          <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">
            Tickets
          </h4>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {analytics.tickets.total}
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {analytics.tickets.openTickets} open, {analytics.tickets.resolvedTickets} resolved
          </div>
        </Link>

        {/* Risks */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">
            Risks
          </h4>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {analytics.risks.total}
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {analytics.risks.critical} critical
          </div>
        </div>

        {/* Issues */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h4 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">
            Issues
          </h4>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {analytics.issues.total}
          </div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            {analytics.issues.open} open
          </div>
        </div>
      </div>

      {/* Project Details */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Project Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Status
              </p>
              <Badge variant="info" size="sm">
                {project.status.replace("_", " ")}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Priority
              </p>
              <Badge variant="info" size="sm">
                {project.priority}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Start Date
              </p>
              <p className="text-base text-neutral-900 dark:text-neutral-100">
                {project.startDate ? formatDate(project.startDate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                End Date
              </p>
              <p className="text-base text-neutral-900 dark:text-neutral-100">
                {project.endDate ? formatDate(project.endDate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Client
              </p>
              <p className="text-base text-neutral-900 dark:text-neutral-100">
                {project.client || "—"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Budget
              </p>
              <p className="text-base text-neutral-900 dark:text-neutral-100">
                {project.budget ? `$${project.budget.toLocaleString()}` : "—"}
              </p>
            </div>
        </div>
      </div>
    </div>
  );
}

function calculateHealthScore(analytics: Analytics): number {
  let score = 0;
  let factors = 0;

  // Progress factor (30%)
  // Only count if there are tasks to track progress
  const hasTasks = analytics.progress.overall > 0 || Object.keys(analytics.progress.byStatus).length > 0;
  if (hasTasks) {
    score += analytics.progress.overall * 0.3;
    factors += 0.3;
  }

  // Budget factor (25%) - lower is better
  if (analytics.budget.totalBudget > 0) {
    const budgetRatio = analytics.budget.spent / analytics.budget.totalBudget;
    const budgetScore = budgetRatio <= 1 ? (1 - budgetRatio) * 100 : 0;
    score += budgetScore * 0.25;
    factors += 0.25;
  }

  // Time tracking factor (20%) - on track is better
  if (analytics.timeTracking.totalPlanned > 0) {
    const timeRatio = analytics.timeTracking.totalActual / analytics.timeTracking.totalPlanned;
    const timeScore = timeRatio <= 1 ? (1 - timeRatio) * 100 : Math.max(0, 100 - (timeRatio - 1) * 50);
    score += timeScore * 0.2;
    factors += 0.2;
  }

  // Issues factor (15%) - fewer is better
  // Only count if there are actual issues to evaluate
  if (analytics.issues.total > 0) {
    const issuesScore = Math.max(0, 100 - (analytics.issues.open / analytics.issues.total) * 100);
    score += issuesScore * 0.15;
    factors += 0.15;
  }

  // Risks factor (10%) - fewer critical is better
  // Only count if there are actual risks to evaluate
  if (analytics.risks.total > 0) {
    const risksScore = Math.max(0, 100 - (analytics.risks.critical / analytics.risks.total) * 100);
    score += risksScore * 0.1;
    factors += 0.1;
  }

  // If no meaningful data exists, return 0 instead of normalizing
  // This prevents showing a score when the project has no activity
  if (factors === 0) {
    return 0;
  }

  // Normalize by actual factors used
  return Math.round(score / factors);
}
