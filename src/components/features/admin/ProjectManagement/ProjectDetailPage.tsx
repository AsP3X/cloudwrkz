"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { updateProject, deleteProject, type ProjectUpdateInput } from "@/server/actions/projects";
import { getAllUsers } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";
import type { getProject } from "@/server/actions/projects";
import { formatDate, formatDateTimeFull } from "@/lib/utils/date";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

interface ProjectDetailPageProps {
  project: Project;
}

const STATUS_OPTIONS = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function ProjectDetailPage({ project: initialProject }: ProjectDetailPageProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [formData, setFormData] = useState<ProjectUpdateInput>({
    name: project.name,
    description: project.description || "",
    status: project.status,
    priority: project.priority,
    startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : undefined,
    endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : undefined,
    budget: project.budget || undefined,
    client: project.client || "",
    color: project.color || "",
    icon: project.icon || "",
    managerIds: project.members.filter((m) => m.role === "MANAGER").map((m) => m.user.id),
    memberIds: project.members.filter((m) => m.role === "MEMBER").map((m) => m.user.id),
    groupIds: project.groups.map((pg) => pg.group.id),
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (editDialogOpen) {
      loadUsersAndGroups();
      setFormData({
        name: project.name,
        description: project.description || "",
        status: project.status,
        priority: project.priority,
        startDate: project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : undefined,
        endDate: project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : undefined,
        budget: project.budget || undefined,
        client: project.client || "",
        color: project.color || "",
        icon: project.icon || "",
        managerIds: project.members.filter((m) => m.role === "MANAGER").map((m) => m.user.id),
        memberIds: project.members.filter((m) => m.role === "MEMBER").map((m) => m.user.id),
        groupIds: project.groups.map((pg) => pg.group.id),
      });
      setError(null);
      setFieldErrors({});
    }
  }, [editDialogOpen, project]);

  const loadUsersAndGroups = async () => {
    setLoadingUsers(true);
    try {
      const [usersData, groupsData] = await Promise.all([
        getAllUsers(),
        getGroups(),
      ]);
      setUsers(usersData);
      setGroups(groupsData);
    } catch (error) {
      console.error("Error loading users/groups:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      const result = await updateProject(project.id, formData);
      setIsLoading(false);

      if (result.success) {
        setEditDialogOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update project");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      }
    } catch (error) {
      console.error("Error updating project:", error);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    const result = await deleteProject(project.id);
    setIsLoading(false);
    if (result.success) {
      router.push("/dashboard/admin/projects");
    } else {
      setError(result.error || "Failed to delete project");
    }
  };

  const handleMultiSelectChange = (
    field: "managerIds" | "memberIds" | "groupIds",
    value: string
  ) => {
    const currentValues = formData[field] || [];
    if (currentValues.includes(value)) {
      setFormData({
        ...formData,
        [field]: currentValues.filter((id) => id !== value),
      });
    } else {
      setFormData({
        ...formData,
        [field]: [...currentValues, value],
      });
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

  const managers = project.members.filter((m) => m.role === "MANAGER");
  const members = project.members.filter((m) => m.role === "MEMBER");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/dashboard/admin/projects" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
            Edit Project
          </Button>
          <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
            Delete Project
          </Button>
        </div>
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
              {project.startDate ? formatDate(project.startDate) : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">End Date</p>
            <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
              {project.endDate ? formatDate(project.endDate) : "—"}
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
              {formatDateTimeFull(project.createdAt)}
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

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title="Edit Project"
        description={`Edit project: ${project.name}`}
      >
        <form onSubmit={handleUpdate} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-300 text-sm">
              {error}
            </div>
          )}

          <Input
            label="Project Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={fieldErrors.name?.[0]}
          />

          <Textarea
            label="Description"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            error={fieldErrors.description?.[0]}
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              required
              options={STATUS_OPTIONS}
              value={formData.status || "PLANNING"}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              error={fieldErrors.status?.[0]}
            />

            <Select
              label="Priority"
              required
              options={PRIORITY_OPTIONS}
              value={formData.priority || "MEDIUM"}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              error={fieldErrors.priority?.[0]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={formData.startDate || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  startDate: e.target.value || undefined,
                })
              }
              error={fieldErrors.startDate?.[0]}
            />

            <Input
              label="End Date"
              type="date"
              value={formData.endDate || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  endDate: e.target.value || undefined,
                })
              }
              error={fieldErrors.endDate?.[0]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Budget"
              type="number"
              step="0.01"
              min="0"
              value={formData.budget || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  budget: e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              error={fieldErrors.budget?.[0]}
            />

            <Input
              label="Client"
              value={formData.client || ""}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
              error={fieldErrors.client?.[0]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Color"
              type="color"
              value={formData.color || "#3b82f6"}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              error={fieldErrors.color?.[0]}
            />

            <Input
              label="Icon"
              placeholder="Icon identifier (optional)"
              value={formData.icon || ""}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              error={fieldErrors.icon?.[0]}
            />
          </div>

          {/* Project Managers */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Project Managers
            </label>
            {loadingUsers ? (
              <p className="text-sm text-neutral-500">Loading users...</p>
            ) : (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-neutral-500">No users available</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={formData.managerIds?.includes(user.id) || false}
                          onChange={() => handleMultiSelectChange("managerIds", user.id)}
                          className="rounded border-neutral-300 dark:border-neutral-700"
                        />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {user.name || user.email} {user.email !== user.name && `(${user.email})`}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project Members */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Project Members
            </label>
            {loadingUsers ? (
              <p className="text-sm text-neutral-500">Loading users...</p>
            ) : (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-neutral-500">No users available</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={formData.memberIds?.includes(user.id) || false}
                          onChange={() => handleMultiSelectChange("memberIds", user.id)}
                          className="rounded border-neutral-300 dark:border-neutral-700"
                        />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {user.name || user.email} {user.email !== user.name && `(${user.email})`}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project Groups */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Project Groups
            </label>
            {loadingUsers ? (
              <p className="text-sm text-neutral-500">Loading groups...</p>
            ) : (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="text-sm text-neutral-500">No groups available</p>
                ) : (
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={formData.groupIds?.includes(group.id) || false}
                          onChange={() => handleMultiSelectChange("groupIds", group.id)}
                          className="rounded border-neutral-300 dark:border-neutral-700"
                        />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {group.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Project"
        description={`Are you sure you want to delete ${project.name}? This action cannot be undone.`}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 rounded-lg mb-4">
            <p className="text-sm text-error-700 dark:text-error-300">
              This will permanently delete the project and all associated data. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isLoading}>
              Delete Project
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
