"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { getProject } from "@/server/actions/projects";
import type { getProjectAnalytics } from "@/server/actions/project-analytics";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { ProjectOverviewTab } from "./tabs/ProjectOverviewTab";
import { ProjectPlanningTab } from "./tabs/ProjectPlanningTab";
import { ProjectTrackingTab } from "./tabs/ProjectTrackingTab";
import { ProjectAnalyticsTab } from "./tabs/ProjectAnalyticsTab";
import { ProjectRisksIssuesTab } from "./tabs/ProjectRisksIssuesTab";
import { ProjectTeamTab } from "./tabs/ProjectTeamTab";
import { ProjectSettingsTab } from "./tabs/ProjectSettingsTab";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Analytics = NonNullable<Awaited<ReturnType<typeof getProjectAnalytics>>>;

interface ProjectOwnerPageProps {
  project: Project;
  analytics: Analytics;
}

export function ProjectOwnerPage({ project, analytics }: ProjectOwnerPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

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

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: <ProjectOverviewTab project={project} analytics={analytics} />,
    },
    {
      id: "planning",
      label: "Planning",
      content: <ProjectPlanningTab project={project} />,
    },
    {
      id: "tracking",
      label: "Tracking",
      content: <ProjectTrackingTab project={project} analytics={analytics} />,
    },
    {
      id: "analytics",
      label: "Analytics",
      content: <ProjectAnalyticsTab project={project} analytics={analytics} />,
    },
    {
      id: "risks-issues",
      label: "Risks & Issues",
      content: <ProjectRisksIssuesTab project={project} />,
    },
    {
      id: "team",
      label: "Team",
      content: <ProjectTeamTab project={project} analytics={analytics} />,
    },
    {
      id: "settings",
      label: "Settings",
      content: <ProjectSettingsTab project={project} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/projects"
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block"
        >
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Progress</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {analytics.progress.overall.toFixed(0)}%
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Budget Used</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project.budget
              ? `${((analytics.budget.spent / project.budget) * 100).toFixed(0)}%`
              : "—"}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Time Spent</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {analytics.timeTracking.totalActual.toFixed(0)}h
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Open Issues</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {analytics.issues.open}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-4 md:p-6">
        <Tabs tabs={tabs} defaultTab="overview" />
      </div>
    </div>
  );
}
