import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

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

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "TERMINATED"] as const;
const EMPLOYMENT_TYPE_OPTIONS = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "INTERN",
  "TEMPORARY",
] as const;

const EMPTY_FORM: CreateEmployeeForm = {
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

export default function EmployeeCreatePage() {
  const { can } = useAuth();
  const canCreate = can("employees.create");
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateEmployeeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to create employee records."
        primaryHref={ROUTES.EMPLOYEES}
        primaryLabel="Back to Employees"
      />
    );
  }

  // Human: This submit maps plain form state into the employee-create API contract and relies on
  // the API client's 202 mutation polling to resolve when the background job completes.
  // Agent: CALLS POST /employees; INPUT form fields; OUTPUT navigates to /dashboard/employees on success.
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/employees", {
        employee_code: form.employee_code.trim(),
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
      navigate(ROUTES.EMPLOYEES);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else if (submitError instanceof Error) {
        setError(submitError.message);
      } else {
        setError("Failed to create employee.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Create employee</h1>
        <Button asChild variant="outline" type="button">
          <Link to={ROUTES.EMPLOYEES}>Back to list</Link>
        </Button>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900"
      >
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Employee code*" value={form.employee_code} onChange={(v) => setForm((p) => ({ ...p, employee_code: v }))} />
          <Field label="Work email" value={form.work_email} onChange={(v) => setForm((p) => ({ ...p, work_email: v }))} />
          <Field label="First name*" value={form.first_name} onChange={(v) => setForm((p) => ({ ...p, first_name: v }))} />
          <Field label="Last name*" value={form.last_name} onChange={(v) => setForm((p) => ({ ...p, last_name: v }))} />
          <Field label="Display name" value={form.display_name} onChange={(v) => setForm((p) => ({ ...p, display_name: v }))} />
          <Field label="Department" value={form.department} onChange={(v) => setForm((p) => ({ ...p, department: v }))} />
          <Field label="Job title" value={form.job_title} onChange={(v) => setForm((p) => ({ ...p, job_title: v }))} />
          <Field label="Location" value={form.location} onChange={(v) => setForm((p) => ({ ...p, location: v }))} />
          <DateField label="Hire date*" value={form.hire_date} onChange={(v) => setForm((p) => ({ ...p, hire_date: v }))} />
          <SelectField
            label="Status"
            value={form.status}
            options={STATUS_OPTIONS}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
          />
          <SelectField
            label="Employment type"
            value={form.employment_type}
            options={EMPLOYMENT_TYPE_OPTIONS}
            onChange={(v) => setForm((p) => ({ ...p, employment_type: v }))}
          />
        </div>

        <Field label="Notes" value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} multiline />

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create employee"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {multiline ? (
        <textarea
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        type="date"
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
