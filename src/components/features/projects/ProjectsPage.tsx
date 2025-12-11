"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { ProjectFilterButton } from "./ProjectFilterButton";
import type { getAllProjects } from "@/server/actions/projects";

type Project = Awaited<ReturnType<typeof getAllProjects>>[0];

type ProjectViewMode = "grid" | "list" | "card";

interface ProjectsPageProps {
  initialProjects: Project[];
  searchParams?: {
    status?: string;
    priority?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sort?: string;
  };
}

const VIEW_MODE_STORAGE_KEY = "projects-page-view-mode";

export function ProjectsPage({ initialProjects, searchParams = {} }: ProjectsPageProps) {
  const [viewMode, setViewMode] = useState<ProjectViewMode>("grid"); // Safe default
  const [mounted, setMounted] = useState(false);

  // Filter and sort projects based on search params
  const filteredProjects = useMemo(() => {
    let filtered = [...initialProjects];

    // Filter by status
    if (searchParams.status) {
      filtered = filtered.filter((p) => p.status === searchParams.status);
    }

    // Filter by priority
    if (searchParams.priority) {
      filtered = filtered.filter((p) => p.priority === searchParams.priority);
    }

    // Filter by created date range
    if (searchParams.createdFrom) {
      const fromDate = new Date(searchParams.createdFrom);
      filtered = filtered.filter((p) => new Date(p.createdAt) >= fromDate);
    }
    if (searchParams.createdTo) {
      const toDate = new Date(searchParams.createdTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      filtered = filtered.filter((p) => new Date(p.createdAt) <= toDate);
    }

    // Filter by updated date range
    if (searchParams.updatedFrom) {
      const fromDate = new Date(searchParams.updatedFrom);
      filtered = filtered.filter((p) => new Date(p.updatedAt) >= fromDate);
    }
    if (searchParams.updatedTo) {
      const toDate = new Date(searchParams.updatedTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire day
      filtered = filtered.filter((p) => new Date(p.updatedAt) <= toDate);
    }

    // Sort projects
    const sortParam = searchParams.sort || "createdAt-desc";
    const [sortBy, sortOrder] = sortParam.split("-") as [string, "asc" | "desc"];

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "updatedAt":
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        case "createdAt":
        default:
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [initialProjects, searchParams]);

  useEffect(() => {
    setMounted(true);
    // Load view mode from localStorage
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored && (stored === "grid" || stored === "list" || stored === "card")) {
        setViewMode(stored as ProjectViewMode);
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }, []);

  const handleViewModeChange = (mode: ProjectViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch (error) {
      // Ignore localStorage errors
    }
  };

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">My Projects</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Projects you are assigned to ({filteredProjects.length} of {initialProjects.length})
          </p>
        </div>

        {/* View Mode Toggle and Filters */}
        <div className="flex items-center gap-3">
          {filteredProjects.length > 0 && (
            <div className="inline-flex rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1" role="group" aria-label="Project view options">
            <button
              type="button"
              onClick={() => handleViewModeChange("grid")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                viewMode === "grid"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("list")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                viewMode === "list"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("card")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                viewMode === "card"
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              )}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="hidden sm:inline">Card</span>
            </button>
          </div>
          )}
          <ProjectFilterButton />
        </div>
      </div>

      {/* Projects List */}
      <div className={cn("transition-opacity duration-200", mounted ? "opacity-100" : "opacity-0")}>
      {filteredProjects.length === 0 ? (
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
      ) : viewMode === "list" ? (
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
                {filteredProjects.map((project) => (
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
          {filteredProjects.map((project) => (
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
    </div>
  );
}
