"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";
import type { getProject } from "@/server/actions/projects";
import type { getProjectAnalytics } from "@/server/actions/project-analytics";
import { cn } from "@/lib/utils/cn";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Analytics = NonNullable<Awaited<ReturnType<typeof getProjectAnalytics>>>;

interface ProjectTeamTabProps {
  project: Project;
  analytics: Analytics;
}

export function ProjectTeamTab({ project, analytics }: ProjectTeamTabProps) {
  const managers = project.members.filter((m) => m.role === "MANAGER");
  const members = project.members.filter((m) => m.role === "MEMBER");

  return (
    <div className="space-y-6">
      {/* Team Overview */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Team Overview</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Members</div>
            <div className="text-2xl font-bold">{analytics.team.totalMembers}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Active Members</div>
            <div className="text-2xl font-bold">{analytics.team.activeMembers}</div>
          </div>
          <div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Managers</div>
            <div className="text-2xl font-bold">{managers.length}</div>
          </div>
        </div>
      </div>

      {/* Managers */}
      {managers.length > 0 && (
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold mb-4">Managers</h3>
          <div className="space-y-3">
            {managers.map((membership) => {
              const workload = analytics.team.workload.find((w) => w.userId === membership.user.id);
              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {membership.user.name || membership.user.email}
                      </h4>
                      <Badge variant="info" size="sm">
                        Manager
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {membership.user.email}
                    </p>
                    {workload && (
                      <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                        <span>
                          {workload.completedTasks} / {workload.assignedTasks} tasks
                        </span>
                        <span>{workload.timeSpent.toFixed(1)}h spent</span>
                        <span>{((workload.timeSpent / workload.capacity) * 100).toFixed(0)}% capacity</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Members */}
      {members.length > 0 && (
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold mb-4">Team Members</h3>
          <div className="space-y-3">
            {members.map((membership) => {
              const workload = analytics.team.workload.find((w) => w.userId === membership.user.id);
              return (
                <div
                  key={membership.id}
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {membership.user.name || membership.user.email}
                      </h4>
                      <Badge variant="default" size="sm">
                        Member
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {membership.user.email}
                    </p>
                    {workload && (
                      <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                        <span>
                          {workload.completedTasks} / {workload.assignedTasks} tasks
                        </span>
                        <span>{workload.timeSpent.toFixed(1)}h spent</span>
                        <span>{((workload.timeSpent / workload.capacity) * 100).toFixed(0)}% capacity</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Workload Visualization */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Workload Distribution</h3>
        <div className="space-y-4">
          {analytics.team.workload.map((member) => {
            const capacityPercent = (member.timeSpent / member.capacity) * 100;
            return (
              <div key={member.userId}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">{member.userName}</span>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {member.timeSpent.toFixed(1)}h / {member.capacity}h
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3">
                  <div
                    className={cn(
                      "h-3 rounded-full transition-all",
                      capacityPercent > 100
                        ? "bg-red-500"
                        : capacityPercent > 80
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    )}
                    style={{ width: `${Math.min(100, capacityPercent)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Groups */}
      {project.groups.length > 0 && (
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold mb-4">Project Groups</h3>
          <div className="space-y-3">
            {project.groups.map((projectGroup) => (
              <div
                key={projectGroup.id}
                className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg"
              >
                <div>
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                    {projectGroup.group.name}
                  </h4>
                  {projectGroup.group.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {projectGroup.group.description}
                    </p>
                  )}
                </div>
                <Badge variant="info" size="sm">
                  Group
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
