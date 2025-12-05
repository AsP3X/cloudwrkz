"use client";

import React, { useState, useMemo } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

interface Project {
  id: string;
  code: string;
  name: string;
  color: string | null;
  status: string;
}

interface ProjectAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  currentProjectId: string | null;
  onSelect: (projectId: string | null) => void;
  isLoading?: boolean;
}

export function ProjectAssignmentDialog({
  open,
  onOpenChange,
  projects,
  currentProjectId,
  onSelect,
  isLoading = false,
}: ProjectAssignmentDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects;
    }

    const query = searchQuery.toLowerCase();
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.code.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const handleSelect = (projectId: string | null) => {
    onSelect(projectId);
    onOpenChange(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    handleSelect(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign to Project"
      description="Select a project to assign this ticket to. You can only assign tickets to projects you're a member of."
    >
      <div className="p-6 space-y-4">
        {/* Search Input */}
        <div>
          <Input
            type="text"
            placeholder="Search projects by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
            autoFocus
          />
        </div>

        {/* Projects List */}
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              {searchQuery
                ? "No projects found matching your search."
                : "No projects available. You need to be a member of a project to assign tickets to it."}
            </div>
          ) : (
            <>
              {/* Clear assignment option */}
              <button
                onClick={handleClear}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                  !currentProjectId
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      No Project
                    </div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      Remove project assignment
                    </div>
                  </div>
                </div>
              </button>

              {/* Project options */}
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelect(project.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                    currentProjectId === project.id
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {project.color && (
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                    )}
                    {!project.color && (
                      <div className="w-4 h-4 rounded-full border-2 border-neutral-300 dark:border-neutral-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {project.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-mono text-neutral-500 dark:text-neutral-400">
                          {project.code}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {project.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    {currentProjectId === project.id && (
                      <svg
                        className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
