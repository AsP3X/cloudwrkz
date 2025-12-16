"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import type { getProject } from "@/server/actions/projects";
import { getProjectMilestones } from "@/server/actions/milestones";
import { getProjectTasks } from "@/server/actions/tasks";
import { getProjectBudgetCategories } from "@/server/actions/budget-categories";
import { createMilestone, updateMilestone, deleteMilestone } from "@/server/actions/milestones";
import { createTask, updateTask, deleteTask } from "@/server/actions/tasks";
import { createBudgetCategory, updateBudgetCategory, deleteBudgetCategory } from "@/server/actions/budget-categories";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

interface ProjectPlanningTabProps {
  project: Project;
}

export function ProjectPlanningTab({ project }: ProjectPlanningTabProps) {
  const router = useRouter();
  const [milestones, setMilestones] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"milestones" | "tasks" | "budget" | "timeline">("milestones");
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [milestonesData, tasksData, budgetData] = await Promise.all([
        getProjectMilestones(project.id),
        getProjectTasks(project.id),
        getProjectBudgetCategories(project.id),
      ]);
      setMilestones(milestonesData);
      setTasks(tasksData);
      setBudgetCategories(budgetData);
    } catch (error) {
      console.error("Error loading planning data:", error);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateMilestone = async (data: any) => {
    const result = await createMilestone(project.id, data);
    if (result.success) {
      router.refresh();
      await loadData();
      setMilestoneDialogOpen(false);
    }
    return result;
  };

  const handleUpdateMilestone = async (id: string, data: any) => {
    const result = await updateMilestone(id, data);
    if (result.success) {
      router.refresh();
      await loadData();
      setMilestoneDialogOpen(false);
      setEditingItem(null);
    }
    return result;
  };

  const handleDeleteMilestone = async (id: string) => {
    if (confirm("Are you sure you want to delete this milestone?")) {
      const result = await deleteMilestone(id);
      if (result.success) {
        router.refresh();
        await loadData();
      }
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        {[
          { id: "milestones", label: "Milestones" },
          { id: "tasks", label: "Tasks" },
          { id: "budget", label: "Budget" },
          { id: "timeline", label: "Timeline" },
        ].map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as any)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeSection === section.id
                ? "border-primary-600 text-primary-600 dark:text-primary-400"
                : "border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            )}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Milestones Section */}
      {activeSection === "milestones" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Milestones</h3>
            <Button
              onClick={() => {
                setEditingItem(null);
                setMilestoneDialogOpen(true);
              }}
            >
              Add Milestone
            </Button>
          </div>
          <div className="space-y-3">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {milestone.name}
                      </h4>
                      <Badge
                        variant={
                          milestone.status === "COMPLETED"
                            ? "success"
                            : milestone.status === "IN_PROGRESS"
                            ? "info"
                            : milestone.status === "BLOCKED"
                            ? "error"
                            : "default"
                        }
                        size="sm"
                      >
                        {milestone.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {milestone.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {milestone.description}
                      </p>
                    )}
                    {milestone.targetDate && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        Target: {formatDate(milestone.targetDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingItem(milestone);
                        setMilestoneDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteMilestone(milestone.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {milestones.length === 0 && (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                No milestones yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tasks Section */}
      {activeSection === "tasks" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Tasks</h3>
            <Button
              onClick={() => {
                setEditingItem(null);
                setTaskDialogOpen(true);
              }}
            >
              Add Task
            </Button>
          </div>
          <div className="space-y-3">
            {tasks
              .filter((t) => !t.parentTaskId)
              .map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  allTasks={tasks}
                  onEdit={(t) => {
                    setEditingItem(t);
                    setTaskDialogOpen(true);
                  }}
                  onDelete={async (id) => {
                    if (confirm("Are you sure you want to delete this task?")) {
                      const result = await deleteTask(id);
                      if (result.success) {
                        router.refresh();
                        await loadData();
                      }
                    }
                  }}
                />
              ))}
            {tasks.filter((t) => !t.parentTaskId).length === 0 && (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                No tasks yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget Section */}
      {activeSection === "budget" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Budget Categories</h3>
            <Button
              onClick={() => {
                setEditingItem(null);
                setBudgetDialogOpen(true);
              }}
            >
              Add Category
            </Button>
          </div>
          <div className="space-y-3">
            {budgetCategories.map((category) => (
              <div
                key={category.id}
                className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">
                      {category.name}
                    </h4>
                    {category.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {category.description}
                      </p>
                    )}
                    <div className="flex gap-4 text-sm">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Budgeted: ${category.budgetedAmount.toFixed(2)}
                      </span>
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Spent: ${category.spentAmount.toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          category.spentAmount > category.budgetedAmount
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        )}
                      >
                        Remaining: ${(category.budgetedAmount - category.spentAmount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingItem(category);
                        setBudgetDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Are you sure you want to delete this category?")) {
                          const result = await deleteBudgetCategory(category.id);
                          if (result.success) {
                            router.refresh();
                            await loadData();
                          }
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {budgetCategories.length === 0 && (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                No budget categories yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline Section */}
      {activeSection === "timeline" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Timeline View</h3>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 border border-neutral-200 dark:border-neutral-700">
            <p className="text-neutral-600 dark:text-neutral-400">
              Timeline/Gantt chart view coming soon. This will show milestones and tasks on a
              timeline with dependencies.
            </p>
          </div>
        </div>
      )}

      {/* Milestone Dialog */}
      <MilestoneDialog
        open={milestoneDialogOpen}
        onClose={() => {
          setMilestoneDialogOpen(false);
          setEditingItem(null);
        }}
        milestone={editingItem}
        onSubmit={editingItem ? (data) => handleUpdateMilestone(editingItem.id, data) : handleCreateMilestone}
      />

      {/* Task Dialog */}
      <TaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false);
          setEditingItem(null);
        }}
        task={editingItem}
        project={project}
        milestones={milestones}
        tasks={tasks}
        onSubmit={
          editingItem
            ? async (data) => {
                const result = await updateTask(editingItem.id, data);
                if (result.success) {
                  router.refresh();
                  loadData();
                  setTaskDialogOpen(false);
                  setEditingItem(null);
                }
                return result;
              }
            : async (data) => {
                const result = await createTask(data);
                if (result.success) {
                  router.refresh();
                  loadData();
                  setTaskDialogOpen(false);
                }
                return result;
              }
        }
      />

      {/* Budget Dialog */}
      <BudgetDialog
        open={budgetDialogOpen}
        onClose={() => {
          setBudgetDialogOpen(false);
          setEditingItem(null);
        }}
        category={editingItem}
        onSubmit={
          editingItem
            ? async (data) => {
                const result = await updateBudgetCategory(editingItem.id, data);
                if (result.success) {
                  router.refresh();
                  loadData();
                  setBudgetDialogOpen(false);
                  setEditingItem(null);
                }
                return result;
              }
            : async (data) => {
                const result = await createBudgetCategory(project.id, data);
                if (result.success) {
                  router.refresh();
                  loadData();
                  setBudgetDialogOpen(false);
                }
                return result;
              }
        }
      />
    </div>
  );
}

function TaskItem({
  task,
  allTasks,
  onEdit,
  onDelete,
}: {
  task: any;
  allTasks: any[];
  onEdit: (task: any) => void;
  onDelete: (id: string) => void;
}) {
  const subtasks = allTasks.filter((t) => t.parentTaskId === task.id);
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{task.title}</h4>
            <Badge
              variant={
                task.status === "COMPLETED"
                  ? "success"
                  : task.status === "IN_PROGRESS"
                  ? "info"
                  : task.status === "BLOCKED"
                  ? "error"
                  : "default"
              }
              size="sm"
            >
              {task.status.replace("_", " ")}
            </Badge>
            <Badge variant="info" size="sm">
              {task.priority}
            </Badge>
          </div>
          {task.description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
              {task.description}
            </p>
          )}
          <div className="flex gap-4 text-xs text-neutral-500 dark:text-neutral-500">
            {task.assignedTo && (
              <span>Assigned: {task.assignedTo.name || task.assignedTo.email}</span>
            )}
            {task.dueDate && <span>Due: {formatDate(task.dueDate)}</span>}
            {task.estimatedHours && <span>Est: {task.estimatedHours}h</span>}
            {subtasks.length > 0 && <span>{subtasks.length} subtasks</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(task.id)}>
            Delete
          </Button>
        </div>
      </div>
      {subtasks.length > 0 && (
        <div className="mt-3 ml-4 space-y-2 border-l-2 border-neutral-200 dark:border-neutral-700 pl-4">
          {subtasks.map((subtask) => (
            <TaskItem
              key={subtask.id}
              task={subtask}
              allTasks={allTasks}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MilestoneDialog({
  open,
  onClose,
  milestone,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  milestone?: any;
  onSubmit: (data: any) => Promise<any>;
}) {
  const [name, setName] = useState(milestone?.name || "");
  const [description, setDescription] = useState(milestone?.description || "");
  const [status, setStatus] = useState(milestone?.status || "NOT_STARTED");
  const [targetDate, setTargetDate] = useState(
    milestone?.targetDate ? new Date(milestone.targetDate).toISOString().split("T")[0] : ""
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (milestone) {
      setName(milestone.name || "");
      setDescription(milestone.description || "");
      setStatus(milestone.status || "NOT_STARTED");
      setTargetDate(
        milestone.targetDate ? new Date(milestone.targetDate).toISOString().split("T")[0] : ""
      );
    } else {
      setName("");
      setDescription("");
      setStatus("NOT_STARTED");
      setTargetDate("");
    }
  }, [milestone, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        description,
        status,
        targetDate: targetDate || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()} title={milestone ? "Edit Milestone" : "Create Milestone"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "NOT_STARTED", label: "Not Started" },
            { value: "IN_PROGRESS", label: "In Progress" },
            { value: "COMPLETED", label: "Completed" },
            { value: "BLOCKED", label: "Blocked" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
        <Input
          label="Target Date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {milestone ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TaskDialog({
  open,
  onClose,
  task,
  project,
  milestones,
  tasks,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  task?: any;
  project: Project;
  milestones: any[];
  tasks: any[];
  onSubmit: (data: any) => Promise<any>;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState(task?.status || "NOT_STARTED");
  const [priority, setPriority] = useState(task?.priority || "MEDIUM");
  const [assignedToId, setAssignedToId] = useState(task?.assignedToId || "");
  const [estimatedHours, setEstimatedHours] = useState(task?.estimatedHours?.toString() || "");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""
  );
  const [milestoneId, setMilestoneId] = useState(task?.milestoneId || "");
  const [parentTaskId, setParentTaskId] = useState(task?.parentTaskId || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setStatus(task.status || "NOT_STARTED");
      setPriority(task.priority || "MEDIUM");
      setAssignedToId(task.assignedToId || "");
      setEstimatedHours(task.estimatedHours?.toString() || "");
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "");
      setMilestoneId(task.milestoneId || "");
      setParentTaskId(task.parentTaskId || "");
    } else {
      setTitle("");
      setDescription("");
      setStatus("NOT_STARTED");
      setPriority("MEDIUM");
      setAssignedToId("");
      setEstimatedHours("");
      setDueDate("");
      setMilestoneId("");
      setParentTaskId("");
    }
  }, [task, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        title,
        description,
        status,
        priority,
        assignedToId: assignedToId || undefined,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
        dueDate: dueDate || undefined,
        milestoneId: milestoneId || undefined,
        parentTaskId: parentTaskId || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const availableMembers = project.members.map((m) => ({
    value: m.user.id,
    label: m.user.name || m.user.email,
  }));

  const availableMilestones = milestones.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  const availableParentTasks = tasks
    .filter((t) => !t.parentTaskId && t.id !== task?.id)
    .map((t) => ({
      value: t.id,
      label: t.title,
    }));

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()} title={task ? "Edit Task" : "Create Task"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "NOT_STARTED", label: "Not Started" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "BLOCKED", label: "Blocked" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={[
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
              { value: "URGENT", label: "Urgent" },
            ]}
          />
        </div>
        <Select
          label="Assigned To"
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          options={[{ value: "", label: "Unassigned" }, ...availableMembers]}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Estimated Hours"
            type="number"
            step="0.5"
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <Select
          label="Milestone"
          value={milestoneId}
          onChange={(e) => setMilestoneId(e.target.value)}
          options={[{ value: "", label: "No Milestone" }, ...availableMilestones]}
        />
        <Select
          label="Parent Task"
          value={parentTaskId}
          onChange={(e) => setParentTaskId(e.target.value)}
          options={[{ value: "", label: "No Parent" }, ...availableParentTasks]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {task ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BudgetDialog({
  open,
  onClose,
  category,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  category?: any;
  onSubmit: (data: any) => Promise<any>;
}) {
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [budgetedAmount, setBudgetedAmount] = useState(category?.budgetedAmount?.toString() || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (category) {
      setName(category.name || "");
      setDescription(category.description || "");
      setBudgetedAmount(category.budgetedAmount?.toString() || "");
    } else {
      setName("");
      setDescription("");
      setBudgetedAmount("");
    }
  }, [category, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        description,
        budgetedAmount: parseFloat(budgetedAmount) || 0,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={category ? "Edit Budget Category" : "Create Budget Category"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          label="Budgeted Amount"
          type="number"
          step="0.01"
          value={budgetedAmount}
          onChange={(e) => setBudgetedAmount(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {category ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
