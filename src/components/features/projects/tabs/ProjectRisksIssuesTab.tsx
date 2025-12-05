"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import type { getProject } from "@/server/actions/projects";
import {
  getProjectRisks,
  getProjectIssues,
  createRisk,
  updateRisk,
  deleteRisk,
  createIssue,
  updateIssue,
  deleteIssue,
} from "@/server/actions/project-risks-issues";
import { formatDate } from "@/lib/utils/date";
import { useRouter } from "next/navigation";

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

interface ProjectRisksIssuesTabProps {
  project: Project;
}

export function ProjectRisksIssuesTab({ project }: ProjectRisksIssuesTabProps) {
  const router = useRouter();
  const [risks, setRisks] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"risks" | "issues">("risks");
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [project.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [risksData, issuesData] = await Promise.all([
        getProjectRisks(project.id),
        getProjectIssues(project.id),
      ]);
      setRisks(risksData);
      setIssues(issuesData);
    } catch (error) {
      console.error("Error loading risks/issues:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveTab("risks")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === "risks"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-neutral-600 dark:text-neutral-400"
          }`}
        >
          Risks ({risks.length})
        </button>
        <button
          onClick={() => setActiveTab("issues")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === "issues"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-neutral-600 dark:text-neutral-400"
          }`}
        >
          Issues ({issues.length})
        </button>
      </div>

      {/* Risks */}
      {activeTab === "risks" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Risks</h3>
            <Button
              onClick={() => {
                setEditingItem(null);
                setRiskDialogOpen(true);
              }}
            >
              Add Risk
            </Button>
          </div>
          <div className="space-y-3">
            {risks.map((risk) => (
              <div
                key={risk.id}
                className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {risk.title}
                      </h4>
                      <Badge
                        variant={
                          risk.severity === "CRITICAL"
                            ? "error"
                            : risk.severity === "HIGH"
                            ? "warning"
                            : "info"
                        }
                        size="sm"
                      >
                        {risk.severity}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {risk.status}
                      </Badge>
                    </div>
                    {risk.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {risk.description}
                      </p>
                    )}
                    {risk.impact && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                        <strong>Impact:</strong> {risk.impact}
                      </p>
                    )}
                    {risk.mitigationPlan && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        <strong>Mitigation:</strong> {risk.mitigationPlan}
                      </p>
                    )}
                    {risk.owner && (
                      <p className="text-xs text-neutral-500 mt-2">
                        Owner: {risk.owner.name || risk.owner.email}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingItem(risk);
                        setRiskDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Are you sure you want to delete this risk?")) {
                          const result = await deleteRisk(risk.id);
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
            {risks.length === 0 && (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                No risks identified yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issues */}
      {activeTab === "issues" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Issues</h3>
            <Button
              onClick={() => {
                setEditingItem(null);
                setIssueDialogOpen(true);
              }}
            >
              Add Issue
            </Button>
          </div>
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        {issue.title}
                      </h4>
                      <Badge
                        variant={
                          issue.priority === "URGENT"
                            ? "error"
                            : issue.priority === "HIGH"
                            ? "warning"
                            : "info"
                        }
                        size="sm"
                      >
                        {issue.priority}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {issue.status}
                      </Badge>
                    </div>
                    {issue.description && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                        {issue.description}
                      </p>
                    )}
                    {issue.impact && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                        <strong>Impact:</strong> {issue.impact}
                      </p>
                    )}
                    {issue.resolution && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        <strong>Resolution:</strong> {issue.resolution}
                      </p>
                    )}
                    <div className="flex gap-4 text-xs text-neutral-500 mt-2">
                      {issue.assignedTo && (
                        <span>Assigned: {issue.assignedTo.name || issue.assignedTo.email}</span>
                      )}
                      {issue.reportedBy && (
                        <span>Reported by: {issue.reportedBy.name || issue.reportedBy.email}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingItem(issue);
                        setIssueDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (confirm("Are you sure you want to delete this issue?")) {
                          const result = await deleteIssue(issue.id);
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
            {issues.length === 0 && (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                No issues reported yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk Dialog */}
      <RiskDialog
        open={riskDialogOpen}
        onClose={() => {
          setRiskDialogOpen(false);
          setEditingItem(null);
        }}
        risk={editingItem}
        project={project}
        onSubmit={
          editingItem
            ? async (data) => {
                const result = await updateRisk(editingItem.id, data);
                if (result.success) {
                  router.refresh();
                  await loadData();
                  setRiskDialogOpen(false);
                  setEditingItem(null);
                }
                return result;
              }
            : async (data) => {
                const result = await createRisk(project.id, data);
                if (result.success) {
                  router.refresh();
                  await loadData();
                  setRiskDialogOpen(false);
                }
                return result;
              }
        }
      />

      {/* Issue Dialog */}
      <IssueDialog
        open={issueDialogOpen}
        onClose={() => {
          setIssueDialogOpen(false);
          setEditingItem(null);
        }}
        issue={editingItem}
        project={project}
        onSubmit={
          editingItem
            ? async (data) => {
                const result = await updateIssue(editingItem.id, data);
                if (result.success) {
                  router.refresh();
                  await loadData();
                  setIssueDialogOpen(false);
                  setEditingItem(null);
                }
                return result;
              }
            : async (data) => {
                const result = await createIssue(project.id, data);
                if (result.success) {
                  router.refresh();
                  await loadData();
                  setIssueDialogOpen(false);
                }
                return result;
              }
        }
      />
    </div>
  );
}

function RiskDialog({
  open,
  onClose,
  risk,
  project,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  risk?: any;
  project: Project;
  onSubmit: (data: any) => Promise<any>;
}) {
  const [title, setTitle] = useState(risk?.title || "");
  const [description, setDescription] = useState(risk?.description || "");
  const [severity, setSeverity] = useState(risk?.severity || "MEDIUM");
  const [status, setStatus] = useState(risk?.status || "IDENTIFIED");
  const [probability, setProbability] = useState(risk?.probability?.toString() || "");
  const [impact, setImpact] = useState(risk?.impact || "");
  const [mitigationPlan, setMitigationPlan] = useState(risk?.mitigationPlan || "");
  const [ownerId, setOwnerId] = useState(risk?.ownerId || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (risk) {
      setTitle(risk.title || "");
      setDescription(risk.description || "");
      setSeverity(risk.severity || "MEDIUM");
      setStatus(risk.status || "IDENTIFIED");
      setProbability(risk.probability?.toString() || "");
      setImpact(risk.impact || "");
      setMitigationPlan(risk.mitigationPlan || "");
      setOwnerId(risk.ownerId || "");
    } else {
      setTitle("");
      setDescription("");
      setSeverity("MEDIUM");
      setStatus("IDENTIFIED");
      setProbability("");
      setImpact("");
      setMitigationPlan("");
      setOwnerId("");
    }
  }, [risk, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        title,
        description,
        severity,
        status,
        probability: probability ? parseFloat(probability) : undefined,
        impact,
        mitigationPlan,
        ownerId: ownerId || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const availableMembers = project.members.map((m) => ({
    value: m.user.id,
    label: m.user.name || m.user.email,
  }));

  return (
    <Dialog open={open} onClose={onClose} title={risk ? "Edit Risk" : "Create Risk"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={[
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
              { value: "CRITICAL", label: "Critical" },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "IDENTIFIED", label: "Identified" },
              { value: "MONITORING", label: "Monitoring" },
              { value: "MITIGATED", label: "Mitigated" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "ACCEPTED", label: "Accepted" },
            ]}
          />
        </div>
        <Input
          label="Probability (0.0 - 1.0)"
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
        />
        <Textarea label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)} />
        <Textarea
          label="Mitigation Plan"
          value={mitigationPlan}
          onChange={(e) => setMitigationPlan(e.target.value)}
        />
        <Select
          label="Owner"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          options={[{ value: "", label: "Unassigned" }, ...availableMembers]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {risk ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function IssueDialog({
  open,
  onClose,
  issue,
  project,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  issue?: any;
  project: Project;
  onSubmit: (data: any) => Promise<any>;
}) {
  const [title, setTitle] = useState(issue?.title || "");
  const [description, setDescription] = useState(issue?.description || "");
  const [status, setStatus] = useState(issue?.status || "OPEN");
  const [priority, setPriority] = useState(issue?.priority || "MEDIUM");
  const [assignedToId, setAssignedToId] = useState(issue?.assignedToId || "");
  const [impact, setImpact] = useState(issue?.impact || "");
  const [resolution, setResolution] = useState(issue?.resolution || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (issue) {
      setTitle(issue.title || "");
      setDescription(issue.description || "");
      setStatus(issue.status || "OPEN");
      setPriority(issue.priority || "MEDIUM");
      setAssignedToId(issue.assignedToId || "");
      setImpact(issue.impact || "");
      setResolution(issue.resolution || "");
    } else {
      setTitle("");
      setDescription("");
      setStatus("OPEN");
      setPriority("MEDIUM");
      setAssignedToId("");
      setImpact("");
      setResolution("");
    }
  }, [issue, open]);

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
        impact,
        resolution: resolution || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const availableMembers = project.members.map((m) => ({
    value: m.user.id,
    label: m.user.name || m.user.email,
  }));

  return (
    <Dialog open={open} onClose={onClose} title={issue ? "Edit Issue" : "Create Issue"}>
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
              { value: "OPEN", label: "Open" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "CLOSED", label: "Closed" },
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
        <Textarea label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)} />
        {status === "RESOLVED" || status === "CLOSED" ? (
          <Textarea
            label="Resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {issue ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
