"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createProject, type ProjectInput } from "@/server/actions/projects";
import { getAllUsers } from "@/server/actions/users";
import { getGroups } from "@/server/actions/groups";

interface ProjectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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

export function ProjectCreateDialog({ open, onOpenChange, onSuccess }: ProjectCreateDialogProps) {
  const [formData, setFormData] = useState<ProjectInput>({
    name: "",
    description: "",
    status: "PLANNING",
    priority: "MEDIUM",
    startDate: undefined,
    endDate: undefined,
    budget: undefined,
    client: "",
    color: "",
    icon: "",
    managerIds: [],
    memberIds: [],
    groupIds: [],
  });
  const [users, setUsers] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users and groups when dialog opens
  useEffect(() => {
    if (open) {
      loadUsersAndGroups();
    }
  }, [open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      const result = await createProject(formData);

      if (!result.success) {
        setError(result.error || "Failed to create project");
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
      } else {
        // Reset form
        setFormData({
          name: "",
          description: "",
          status: "PLANNING",
          priority: "MEDIUM",
          startDate: undefined,
          endDate: undefined,
          budget: undefined,
          client: "",
          color: "",
          icon: "",
          managerIds: [],
          memberIds: [],
          groupIds: [],
        });
        onOpenChange(false);
        onSuccess();
      }
    } catch (error) {
      console.error("Error creating project:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Project"
      description="Create a new project with all necessary details"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
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
            value={formData.startDate ? (typeof formData.startDate === "string" ? formData.startDate : new Date(formData.startDate).toISOString().split("T")[0]) : ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                startDate: e.target.value ? e.target.value : undefined,
              })
            }
            error={fieldErrors.startDate?.[0]}
          />

          <Input
            label="End Date"
            type="date"
            value={formData.endDate ? (typeof formData.endDate === "string" ? formData.endDate : new Date(formData.endDate).toISOString().split("T")[0]) : ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                endDate: e.target.value ? e.target.value : undefined,
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading}>
            Create Project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
