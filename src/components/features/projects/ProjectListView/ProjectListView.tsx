"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useProjectView } from "../ProjectViewContext";
import type { getAllProjects } from "@/server/actions/projects";

type Project = Awaited<ReturnType<typeof getAllProjects>>[0];

interface ProjectListViewProps {
  projects: Project[];
  getStatusBadgeVariant: (status: string) => "info" | "success" | "warning" | "default" | "error";
  getPriorityBadgeVariant: (priority: string) => "default" | "info" | "warning" | "error";
}

export const ProjectListView = ({ projects, getStatusBadgeVariant, getPriorityBadgeVariant }: ProjectListViewProps) => {
  const { viewMode, isReady } = useProjectView();
  
  // Don't render until we've loaded the correct view mode from localStorage
  // This prevents flashing between view modes
  if (!isReady) {
    return null;
  }

  // Suppress hydration warning since server and client may render different views initially
  return (
    <div suppressHydrationWarning>
      {viewMode === "list" ? (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden md:table-cell">
                    Tickets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider hidden lg:table-cell">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.location.href = `/dashboard/projects/${project.id}`;
                      }
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {project.color && (
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                        )}
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="text-sm font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.code}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="max-w-md">
                          <div className="truncate">{project.name}</div>
                          {project.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                              {project.description}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                        {project.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                        {project.priority}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {project._count.tickets} ticket{project._count.tickets !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      <div className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(project.createdAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={cn(
          "gap-6",
          viewMode === "grid" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
          viewMode === "card" && "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
        )}>
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className={cn(
                "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 hover:shadow-soft-md transition-all duration-200",
                viewMode === "grid" && "p-6",
                viewMode === "card" && "p-4"
              )}
            >
              <>
                <div className={cn(
                  "flex items-start justify-between mb-4",
                  viewMode === "card" && "mb-3"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {project.color && (
                        <div
                          className={cn(
                            "rounded-full flex-shrink-0",
                            viewMode === "card" ? "w-2 h-2" : "w-3 h-3"
                          )}
                          style={{ backgroundColor: project.color }}
                        />
                      )}
                      <h3 className={cn(
                        "font-semibold text-neutral-900 dark:text-neutral-100 truncate",
                        viewMode === "card" ? "text-sm" : "text-lg"
                      )}>
                        {project.name}
                      </h3>
                    </div>
                    <p className={cn(
                      "text-neutral-500 dark:text-neutral-500 font-mono mb-2",
                      viewMode === "card" ? "text-xs" : "text-xs"
                    )}>
                      {project.code}
                    </p>
                    {project.description && (
                      <p className={cn(
                        "text-neutral-600 dark:text-neutral-400",
                        viewMode === "card" ? "text-xs line-clamp-1" : "text-sm line-clamp-2"
                      )}>
                        {project.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className={cn(
                  "flex items-center gap-2 mb-4",
                  viewMode === "card" && "mb-3"
                )}>
                  <Badge variant={getStatusBadgeVariant(project.status)} size="sm">
                    {project.status.replace("_", " ")}
                  </Badge>
                  <Badge variant={getPriorityBadgeVariant(project.priority)} size="sm">
                    {project.priority}
                  </Badge>
                </div>

                <div className={cn(
                  "flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400",
                  viewMode === "card" && "pt-3"
                )}>
                  <span>
                    {project._count.tickets} ticket{project._count.tickets !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {formatDate(project.createdAt)}
                  </span>
                </div>
              </>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
