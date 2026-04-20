import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

type EditableEmployee = {
  first_name: string;
  last_name: string;
  display_name: string;
  department: string;
  job_title: string;
  location: string;
  status: string;
  employment_type: string;
  notes: string;
};

const EMPTY_FORM: EditableEmployee = {
  first_name: "",
  last_name: "",
  display_name: "",
  department: "",
  job_title: "",
  location: "",
  status: "ACTIVE",
  employment_type: "FULL_TIME",
  notes: "",
};

export default function EmployeeEditPage() {
  const { can } = useAuth();
  const canEdit = can("employees.update");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<EditableEmployee>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ employee: Partial<EditableEmployee> }>(`/employees/${id}`);
      const e = data.employee ?? {};
      setForm({
        first_name: String(e.first_name ?? ""),
        last_name: String(e.last_name ?? ""),
        display_name: String(e.display_name ?? ""),
        department: String(e.department ?? ""),
        job_title: String(e.job_title ?? ""),
        location: String(e.location ?? ""),
        status: String(e.status ?? "ACTIVE"),
        employment_type: String(e.employment_type ?? "FULL_TIME"),
        notes: String(e.notes ?? ""),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/employees/${id}`, form);
      navigate(`${ROUTES.EMPLOYEES}/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <AccessDeniedWarning
        message="You don't have permission to edit employee records."
        primaryHref={ROUTES.EMPLOYEES}
        primaryLabel="Back to Employees"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={onSubmit} className="space-y-4 bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Edit Employee</h1>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <Field label="First name" value={form.first_name} onChange={(v) => setForm((p) => ({ ...p, first_name: v }))} />
        <Field label="Last name" value={form.last_name} onChange={(v) => setForm((p) => ({ ...p, last_name: v }))} />
        <Field label="Display name" value={form.display_name} onChange={(v) => setForm((p) => ({ ...p, display_name: v }))} />
        <Field label="Department" value={form.department} onChange={(v) => setForm((p) => ({ ...p, department: v }))} />
        <Field label="Job title" value={form.job_title} onChange={(v) => setForm((p) => ({ ...p, job_title: v }))} />
        <Field label="Location" value={form.location} onChange={(v) => setForm((p) => ({ ...p, location: v }))} />
        <Field label="Status" value={form.status} onChange={(v) => setForm((p) => ({ ...p, status: v }))} />
        <Field label="Employment type" value={form.employment_type} onChange={(v) => setForm((p) => ({ ...p, employment_type: v }))} />
        <Field label="Notes" value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} multiline />

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          <Button asChild variant="outline" type="button">
            <Link to={`${ROUTES.EMPLOYEES}/${id}`}>Cancel</Link>
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
          className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="mt-1 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
