"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { getProject } from "@/server/actions/projects";
import { formatDate, formatDateTimeFull } from "@/lib/utils/date";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

interface ProjectDetailPageProps {
  project: Project;
}

export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const managers = project.members.filter((m) => m.role === "MANAGER");
  const members = project.members.filter((m) => m.role === "MEMBER");
  const userRole = project.members.find((m) => m.user.id === project.createdBy?.id)?.role || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/projects" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
          ← Back to Projects
        </Link>
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
        <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-mono text-sm">
          {project.code}
        </p>
        {project.description && (
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">{project.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tickets</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project._count.tickets}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Time Entries</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project._count.timeEntries}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Members</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project.members.length}
          </p>
        </div>
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Groups</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {project.groups.length}
          </p>
        </div>
      </div>

      {/* Project Details */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Status</p>
            <div className="mt-1">
              <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                {project.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Priority</p>
            <div className="mt-1">
              <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                {project.priority}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Client</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.client || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Budget</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.budget ? `$${project.budget.toLocaleString()}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Start Date</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.startDate && mounted ? formatDate(project.startDate) : project.startDate ? "" : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">End Date</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.endDate && mounted ? formatDate(project.endDate) : project.endDate ? "" : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created By</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.createdBy?.name || project.createdBy?.email || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Created At</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {mounted ? formatDateTimeFull(project.createdAt) : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Project Managers */}
      {managers.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Managers</h2>
          <div className="space-y-3">
            {managers.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {membership.user.name || membership.user.email}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                </div>
                <Badge variant="info" size="sm">Manager</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Members */}
      {members.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Members</h2>
          <div className="space-y-3">
            {members.map((membership) => (
              <div
                key={membership.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {membership.user.name || membership.user.email}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{membership.user.email}</p>
                </div>
                <Badge variant="default" size="sm">Member</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Groups */}
      {project.groups.length > 0 && (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Project Groups</h2>
          <div className="space-y-3">
            {project.groups.map((projectGroup) => (
              <div
                key={projectGroup.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {projectGroup.group.name}
                  </p>
                  {projectGroup.group.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {projectGroup.group.description}
                    </p>
                  )}
                </div>
                <Badge variant="info" size="sm">Group</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
