"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/date";
import type { getAllProjects } from "@/server/actions/projects";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

type Project = Awaited<ReturnType<typeof getAllProjects>>[0];

interface ProjectManagementPageProps {
  initialProjects: Project[];
}

export function ProjectManagementPage({ initialProjects }: ProjectManagementPageProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  // Sync projects state when initialProjects changes (e.g., after router.refresh())
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const handleCreateSuccess = () => {
    setSuccess("Project created successfully");
    setTimeout(() => {
      setSuccess(null);
      router.refresh();
    }, 1000);
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

  // Filter projects based on local search
  const filteredProjects = useMemo(() => {
    if (!localSearch.trim()) {
      return projects;
    }

    const searchLower = localSearch.toLowerCase();
    return projects.filter((project) => {
      const name = project.name.toLowerCase();
      const code = project.code.toLowerCase();
      const description = (project.description || "").toLowerCase();
      const client = (project.client || "").toLowerCase();
      return (
        name.includes(searchLower) ||
        code.includes(searchLower) ||
        description.includes(searchLower) ||
        client.includes(searchLower)
      );
    });
  }, [projects, localSearch]);

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-error-600 dark:text-error-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-error-400 hover:text-error-600 dark:hover:text-error-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-success-600 dark:text-success-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="text-success-400 hover:text-success-600 dark:hover:text-success-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Project Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage all projects ({projects.length} total{localSearch.trim() && filteredProjects.length !== projects.length ? `, ${filteredProjects.length} shown` : ""})
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
          Create Project
        </Button>
      </div>

      {/* Projects List */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {/* Menu Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full sm:max-w-md">
              <Input
                label="Search"
                placeholder="Search by project name, code, description, or client..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Projects Content */}
        {filteredProjects.length === 0 ? (
          <div className="p-12 text-center">
            {localSearch.trim() ? (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                  No projects found
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  No projects match your search criteria.
                </p>
                <Button variant="outline" onClick={() => setLocalSearch("")}>
                  Clear Search
                </Button>
              </>
            ) : (
              <>
                <svg
                  className="w-16 h-16 text-neutral-400 dark:text-neutral-600 mx-auto mb-4"
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
                  No projects yet
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                  Get started by creating your first project.
                </p>
                <Button variant="primary" onClick={() => setCreateDialogOpen(true)}>
                  Create Project
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Tickets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredProjects.map((project) => (
                  <tr
                    key={project.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {project.name}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                          {project.code}
                        </span>
                        {project.description && (
                          <span className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-1">
                            {project.description}
                          </span>
                        )}
                      </div>
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {project.client || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="default" size="sm">
                        {project.members.length} member{project.members.length !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info" size="sm">
                        {project._count.tickets} ticket{project._count.tickets !== 1 ? "s" : ""}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {formatDate(project.createdAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/admin/projects/${project.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <ProjectCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
