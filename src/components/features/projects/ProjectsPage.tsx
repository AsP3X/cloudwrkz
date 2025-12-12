"use client";

import React, { useMemo } from "react";
import { ProjectFilterButton } from "./ProjectFilterButton";
import { ProjectViewProvider } from "./ProjectViewContext";
import { ProjectViewControls } from "./ProjectViewControls";
import { ProjectListView } from "./ProjectListView";
import type { getAllProjects } from "@/server/actions/projects";

type Project = Awaited<ReturnType<typeof getAllProjects>>[0];

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

function ProjectsPageContent({ initialProjects, searchParams = {} }: ProjectsPageProps) {

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
          <ProjectViewControls />
          <ProjectFilterButton />
        </div>
      </div>

      {/* Projects List */}
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
      ) : (
        <ProjectListView
          projects={filteredProjects}
          getStatusBadgeVariant={getStatusBadgeVariant}
          getPriorityBadgeVariant={getPriorityBadgeVariant}
        />
      )}
    </div>
  );
}

export function ProjectsPage(props: ProjectsPageProps) {
  return (
    <ProjectViewProvider>
      <ProjectsPageContent {...props} />
    </ProjectViewProvider>
  );
}
