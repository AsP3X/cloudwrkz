import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/api/client";
import { parseEmployeeCode } from "@/lib/employeeCode";

type CreateEmployeeForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  display_name: string;
  work_email: string;
  department: string;
  job_title: string;
  location: string;
  hire_date: string;
  status: string;
  employment_type: string;
  notes: string;
};

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_LEAVE", label: "On leave" },
  { value: "TERMINATED", label: "Terminated" },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "INTERN", label: "Intern" },
  { value: "TEMPORARY", label: "Temporary" },
] as const;

function emptyForm(): CreateEmployeeForm {
  return {
    employee_code: "",
    first_name: "",
    last_name: "",
    display_name: "",
    work_email: "",
    department: "",
    job_title: "",
    location: "",
    hire_date: new Date().toISOString().slice(0, 10),
    status: "ACTIVE",
    employment_type: "FULL_TIME",
    notes: "",
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-2 border-b border-neutral-200 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {children}
      </h3>
    </div>
  );
}

export interface CreateEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateEmployeeDialog({ open, onOpenChange, onSuccess }: CreateEmployeeDialogProps) {
  const [form, setForm] = React.useState<CreateEmployeeForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required");
      return;
    }

    const codeParsed = parseEmployeeCode(form.employee_code);
    if (!codeParsed.ok) {
      setError(codeParsed.message);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/employees", {
        employee_code: codeParsed.value,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        display_name: form.display_name.trim() || null,
        work_email: form.work_email.trim() || null,
        department: form.department.trim() || null,
        job_title: form.job_title.trim() || null,
        location: form.location.trim() || null,
        hire_date: form.hire_date,
        status: form.status,
        employment_type: form.employment_type,
        notes: form.notes.trim() || null,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to create employee";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add employee"
      description="Create a workforce record with your organization’s identifier and core HR fields."
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 sm:py-6">
        {error ? (
          <div className="mb-6 p-4 bg-error-50 dark:bg-error-950/50 border border-error-200 dark:border-error-800 rounded-xl">
            <p className="text-sm font-medium text-error-800 dark:text-error-200">{error}</p>
          </div>
        ) : null}

        <div className="space-y-8">
          <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 bg-gradient-to-br from-neutral-50/90 to-white dark:from-neutral-800/30 dark:to-neutral-900/80 p-4 sm:p-5 space-y-4">
            <SectionTitle>Identifier</SectionTitle>
            <div>
              <Input
                id="ce-employee-code"
                label="Employee code"
                required
                value={form.employee_code}
                onChange={(ev) => setForm((p) => ({ ...p, employee_code: ev.target.value }))}
                placeholder="e.g. EMP-1024, 00042, US/EAST.12"
                helperText="Letters, digits, and - _ . / : # @ + ( ) , [ ]. Extra spaces collapse; duplicates are blocked case-insensitively."
              />
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Profile</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="ce-first-name"
                label="First name"
                required
                value={form.first_name}
                onChange={(ev) => setForm((p) => ({ ...p, first_name: ev.target.value }))}
                placeholder="Legal first name"
              />
              <Input
                id="ce-last-name"
                label="Last name"
                required
                value={form.last_name}
                onChange={(ev) => setForm((p) => ({ ...p, last_name: ev.target.value }))}
                placeholder="Legal last name"
              />
              <div className="sm:col-span-2">
                <Input
                  id="ce-display-name"
                  label="Display name"
                  value={form.display_name}
                  onChange={(ev) => setForm((p) => ({ ...p, display_name: ev.target.value }))}
                  placeholder="Optional — shown in directory and charts"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  id="ce-work-email"
                  label="Work email"
                  type="email"
                  value={form.work_email}
                  onChange={(ev) => setForm((p) => ({ ...p, work_email: ev.target.value }))}
                  placeholder="name@company.com"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Organization</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="ce-department"
                label="Department"
                value={form.department}
                onChange={(ev) => setForm((p) => ({ ...p, department: ev.target.value }))}
                placeholder="Engineering, Sales…"
              />
              <Input
                id="ce-job-title"
                label="Job title"
                value={form.job_title}
                onChange={(ev) => setForm((p) => ({ ...p, job_title: ev.target.value }))}
                placeholder="Role title"
              />
              <div className="sm:col-span-2">
                <Input
                  id="ce-location"
                  label="Location"
                  value={form.location}
                  onChange={(ev) => setForm((p) => ({ ...p, location: ev.target.value }))}
                  placeholder="Office, region, or remote"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Employment</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="ce-hire-date"
                label="Hire date"
                type="date"
                required
                value={form.hire_date}
                onChange={(ev) => setForm((p) => ({ ...p, hire_date: ev.target.value }))}
              />
              <Select
                id="ce-status"
                label="Status"
                value={form.status}
                onChange={(ev) => setForm((p) => ({ ...p, status: ev.target.value }))}
                options={[...STATUS_OPTIONS]}
              />
              <div className="sm:col-span-2">
                <Select
                  id="ce-employment-type"
                  label="Employment type"
                  value={form.employment_type}
                  onChange={(ev) => setForm((p) => ({ ...p, employment_type: ev.target.value }))}
                  options={[...EMPLOYMENT_TYPE_OPTIONS]}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionTitle>Notes</SectionTitle>
            <Textarea
              id="ce-notes"
              label="Internal notes"
              value={form.notes}
              onChange={(ev) => setForm((p) => ({ ...p, notes: ev.target.value }))}
              placeholder="Onboarding context, visa class, or other HR notes (optional)"
              rows={3}
              className="resize-none min-h-[88px]"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-6 mt-6 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating…
              </span>
            ) : (
              "Create employee"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
