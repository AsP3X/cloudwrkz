"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import type { getAllProjects } from "@/server/actions/projects";

type Project = Awaited<ReturnType<typeof getAllProjects>>[0];

interface ProjectsPageProps {
  initialProjects: Project[];
}

export function ProjectsPage({ initialProjects }: ProjectsPageProps) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">My Projects</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Projects you are assigned to ({initialProjects.length} total)
        </p>
      </div>

      {/* Projects List */}
      {initialProjects.length === 0 ? (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-neutral-400 dark:text-neutral-500 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            No projects assigned
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            You are not currently assigned to any projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {initialProjects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6 hover:shadow-soft-md transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {project.color && (
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                    )}
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                      {project.name}
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono mb-2">
                    {project.code}
                  </p>
                  {project.description && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                  {project.status.replace("_", " ")}
                </Badge>
                <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                  {project.priority}
                </Badge>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
                <span>
                  {project._count.tickets} ticket{project._count.tickets !== 1 ? "s" : ""}
                </span>
                <span>
                  {mounted ? formatDate(project.createdAt) : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
