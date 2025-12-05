"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import type { getProject } from "@/server/actions/projects";
import { updateProject } from "@/server/actions/projects";
import { formatDate } from "@/lib/utils/date";
import { useRouter } from "next/navigation";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

interface ProjectSettingsTabProps {
  project: Project;
}

export function ProjectSettingsTab({ project }: ProjectSettingsTabProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [status, setStatus] = useState(project.status);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(
    project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : ""
  );
  const [endDate, setEndDate] = useState(
    project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : ""
  );
  const [budget, setBudget] = useState(project.budget?.toString() || "");
  const [client, setClient] = useState(project.client || "");
  const [color, setColor] = useState(project.color || "#3b82f6");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const result = await updateProject(project.id, {
        name,
        description,
        status,
        priority,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        budget: budget ? parseFloat(budget) : undefined,
        client: client || undefined,
        color: color || undefined,
      });
      if (result.success) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Project Settings</h3>
          {!editing ? (
            <Button onClick={() => setEditing(true)}>Edit Project</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={submitting}>
                Save Changes
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Input
            label="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editing}
            required
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!editing}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              disabled={!editing}
              options={[
                { value: "PLANNING", label: "Planning" },
                { value: "ACTIVE", label: "Active" },
                { value: "ON_HOLD", label: "On Hold" },
                { value: "COMPLETED", label: "Completed" },
                { value: "CANCELLED", label: "Cancelled" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              disabled={!editing}
              options={[
                { value: "LOW", label: "Low" },
                { value: "MEDIUM", label: "Medium" },
                { value: "HIGH", label: "High" },
                { value: "URGENT", label: "Urgent" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!editing}
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!editing}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Budget"
              type="number"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={!editing}
            />
            <Input
              label="Client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={!editing}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Project Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={!editing}
              className="w-full h-10 rounded border border-neutral-300 dark:border-neutral-700"
            />
          </div>
        </div>
      </div>

      {/* Project Info (Read-only) */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-4">Project Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-neutral-600 dark:text-neutral-400">Project Code</div>
            <div className="font-mono font-medium">{project.code}</div>
          </div>
          <div>
            <div className="text-neutral-600 dark:text-neutral-400">Created By</div>
            <div className="font-medium">
              {project.createdBy?.name || project.createdBy?.email || "—"}
            </div>
          </div>
          <div>
            <div className="text-neutral-600 dark:text-neutral-400">Created At</div>
            <div className="font-medium">{formatDate(project.createdAt)}</div>
          </div>
          <div>
            <div className="text-neutral-600 dark:text-neutral-400">Last Updated</div>
            <div className="font-medium">{formatDate(project.updatedAt)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
