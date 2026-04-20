import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

type EmployeeDetail = Record<string, unknown>;
type EmployeeDetailResponse = {
  employee: EmployeeDetail;
  compensation: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  performance_reviews: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  lifecycle_events: Array<Record<string, unknown>>;
};

export default function EmployeeDetailPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canView = can("modules.employees.view");
  const canEdit = can("employees.update");
  const canDelete = can("employees.delete");
  const canManageComp = can("employees.compensation.manage");
  const canManageAssets = can("employees.assets.manage");
  const canManageSkills = can("employees.skills.manage");
  const canManagePerformance = can("employees.performance.manage");
  const canManageLifecycle = can("employees.lifecycle.manage");
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EmployeeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const [compensationForm, setCompensationForm] = useState({
    pay_frequency: "MONTHLY",
    amount_cents: "",
    currency: "USD",
    compensation_type: "BASE",
    effective_from: new Date().toISOString().slice(0, 10),
  });
  const [assetForm, setAssetForm] = useState({ asset_name: "", category: "", asset_tag: "", notes: "" });
  const [skillForm, setSkillForm] = useState({ skill_name: "", category: "", level: "", verified: false });
  const [certForm, setCertForm] = useState({ certification_name: "", issuer: "", status: "ACTIVE", expires_at: "" });
  const [reviewForm, setReviewForm] = useState({ cycle_name: "", rating: "", summary: "" });
  const [goalForm, setGoalForm] = useState({ title: "", status: "NOT_STARTED", progress_percent: "0", target_date: "" });
  const [lifecycleForm, setLifecycleForm] = useState({ event_type: "ONBOARDING", title: "", status: "PENDING", due_at: "" });

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await api.get<EmployeeDetailResponse>(`/employees/${id}`);
      setData(response);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <AccessDeniedWarning
        message="You don't have access to the Employees module."
        primaryHref={ROUTES.DASHBOARD}
        primaryLabel="Back to Dashboard"
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

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8">
        <p className="text-red-600 dark:text-red-400">{error ?? "Employee not found"}</p>
      </div>
    );
  }

  const employee = data.employee;
  const fullName =
    (employee.display_name as string | undefined) ||
    `${String(employee.first_name ?? "")} ${String(employee.last_name ?? "")}`.trim();

  // Human: All employee mutations here use the shared API client so they automatically follow
  // the 202 + mutation-job polling contract before refreshing the detail snapshot.
  // Agent: CALLS POST/PATCH/DELETE /employees/*; WAITS via api client polling; REFRESHES GET /employees/{id}.
  const runMutation = async (key: string, request: () => Promise<unknown>) => {
    setSubmittingKey(key);
    setActionError(null);
    try {
      await request();
      await load();
    } catch (mutationError) {
      if (mutationError instanceof ApiError) {
        setActionError(mutationError.message);
      } else if (mutationError instanceof Error) {
        setActionError(mutationError.message);
      } else {
        setActionError("Request failed");
      }
    } finally {
      setSubmittingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{fullName || "Employee"}</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Code: {String(employee.employee_code ?? "—")} · Status: {String(employee.status ?? "—")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button asChild variant="outline">
              <Link to={`${ROUTES.EMPLOYEES}/${id}/edit`}>Edit profile</Link>
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              disabled={submittingKey === "delete"}
              onClick={() => {
                if (!id) return;
                if (!window.confirm("Delete this employee? This cannot be undone.")) return;
                void runMutation("delete", () => api.delete(`/employees/${id}`)).then(() => navigate(ROUTES.EMPLOYEES));
              }}
            >
              {submittingKey === "delete" ? "Deleting..." : "Delete employee"}
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to={ROUTES.EMPLOYEES}>Back to list</Link>
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-300">
          {actionError}
        </div>
      ) : null}

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Core profile</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <DetailRow label="Work email" value={employee.work_email} />
          <DetailRow label="Department" value={employee.department} />
          <DetailRow label="Job title" value={employee.job_title} />
          <DetailRow label="Employment type" value={employee.employment_type} />
          <DetailRow label="Location" value={employee.location} />
          <DetailRow label="Hire date" value={employee.hire_date} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EntityTable title="Compensation" rows={data.compensation} />
        {canManageComp ? (
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Add compensation</h3>
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!id) return;
                void runMutation("comp", () =>
                  api.post(`/employees/${id}/compensation`, {
                    pay_frequency: compensationForm.pay_frequency,
                    amount_cents: Number(compensationForm.amount_cents),
                    currency: compensationForm.currency,
                    compensation_type: compensationForm.compensation_type,
                    effective_from: compensationForm.effective_from,
                  }),
                );
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <SelectInput
                  value={compensationForm.pay_frequency}
                  onChange={(value) => setCompensationForm((p) => ({ ...p, pay_frequency: value }))}
                  options={["HOURLY", "WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY", "ANNUAL"]}
                />
                <input className={inputClass} placeholder="Amount cents" value={compensationForm.amount_cents} onChange={(event) => setCompensationForm((p) => ({ ...p, amount_cents: event.target.value }))} />
                <input className={inputClass} placeholder="Currency" value={compensationForm.currency} onChange={(event) => setCompensationForm((p) => ({ ...p, currency: event.target.value }))} />
                <input className={inputClass} placeholder="Type (BASE/BONUS)" value={compensationForm.compensation_type} onChange={(event) => setCompensationForm((p) => ({ ...p, compensation_type: event.target.value }))} />
                <input type="date" className={inputClass} value={compensationForm.effective_from} onChange={(event) => setCompensationForm((p) => ({ ...p, effective_from: event.target.value }))} />
              </div>
              <Button type="submit" disabled={submittingKey === "comp"}>{submittingKey === "comp" ? "Saving..." : "Save compensation"}</Button>
            </form>
          </section>
        ) : null}

        <EntityTable title="Assets" rows={data.assets} />
        {canManageAssets ? (
          <MutationFormSection
            title="Assign asset"
            submitting={submittingKey === "asset"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("asset", () =>
                api.post(`/employees/${id}/assets`, {
                  asset_name: assetForm.asset_name,
                  category: assetForm.category || null,
                  asset_tag: assetForm.asset_tag || null,
                  notes: assetForm.notes || null,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Asset name" value={assetForm.asset_name} onChange={(event) => setAssetForm((p) => ({ ...p, asset_name: event.target.value }))} />
            <input className={inputClass} placeholder="Category" value={assetForm.category} onChange={(event) => setAssetForm((p) => ({ ...p, category: event.target.value }))} />
            <input className={inputClass} placeholder="Asset tag" value={assetForm.asset_tag} onChange={(event) => setAssetForm((p) => ({ ...p, asset_tag: event.target.value }))} />
            <input className={inputClass} placeholder="Notes" value={assetForm.notes} onChange={(event) => setAssetForm((p) => ({ ...p, notes: event.target.value }))} />
          </MutationFormSection>
        ) : null}

        <EntityTable title="Skills" rows={data.skills} />
        {canManageSkills ? (
          <MutationFormSection
            title="Add skill"
            submitting={submittingKey === "skill"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("skill", () =>
                api.post(`/employees/${id}/skills`, {
                  skill_name: skillForm.skill_name,
                  category: skillForm.category || null,
                  level: skillForm.level ? Number(skillForm.level) : null,
                  verified: skillForm.verified,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Skill name" value={skillForm.skill_name} onChange={(event) => setSkillForm((p) => ({ ...p, skill_name: event.target.value }))} />
            <input className={inputClass} placeholder="Category" value={skillForm.category} onChange={(event) => setSkillForm((p) => ({ ...p, category: event.target.value }))} />
            <input className={inputClass} placeholder="Level (1-5)" value={skillForm.level} onChange={(event) => setSkillForm((p) => ({ ...p, level: event.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input type="checkbox" checked={skillForm.verified} onChange={(event) => setSkillForm((p) => ({ ...p, verified: event.target.checked }))} />
              Verified
            </label>
          </MutationFormSection>
        ) : null}

        <EntityTable title="Certifications" rows={data.certifications} />
        {canManageSkills ? (
          <MutationFormSection
            title="Add certification"
            submitting={submittingKey === "cert"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("cert", () =>
                api.post(`/employees/${id}/certifications`, {
                  certification_name: certForm.certification_name,
                  issuer: certForm.issuer || null,
                  status: certForm.status,
                  expires_at: certForm.expires_at || null,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Certification name" value={certForm.certification_name} onChange={(event) => setCertForm((p) => ({ ...p, certification_name: event.target.value }))} />
            <input className={inputClass} placeholder="Issuer" value={certForm.issuer} onChange={(event) => setCertForm((p) => ({ ...p, issuer: event.target.value }))} />
            <input className={inputClass} placeholder="Status" value={certForm.status} onChange={(event) => setCertForm((p) => ({ ...p, status: event.target.value }))} />
            <input type="date" className={inputClass} value={certForm.expires_at} onChange={(event) => setCertForm((p) => ({ ...p, expires_at: event.target.value }))} />
          </MutationFormSection>
        ) : null}

        <EntityTable title="Performance reviews" rows={data.performance_reviews} />
        {canManagePerformance ? (
          <MutationFormSection
            title="Add performance review"
            submitting={submittingKey === "review"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("review", () =>
                api.post(`/employees/${id}/performance-reviews`, {
                  cycle_name: reviewForm.cycle_name,
                  rating: reviewForm.rating ? Number(reviewForm.rating) : null,
                  summary: reviewForm.summary || null,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Cycle name" value={reviewForm.cycle_name} onChange={(event) => setReviewForm((p) => ({ ...p, cycle_name: event.target.value }))} />
            <input className={inputClass} placeholder="Rating (0-5)" value={reviewForm.rating} onChange={(event) => setReviewForm((p) => ({ ...p, rating: event.target.value }))} />
            <textarea className={inputClass} placeholder="Summary" value={reviewForm.summary} onChange={(event) => setReviewForm((p) => ({ ...p, summary: event.target.value }))} />
          </MutationFormSection>
        ) : null}

        <EntityTable title="Goals" rows={data.goals} />
        {canManagePerformance ? (
          <MutationFormSection
            title="Add goal"
            submitting={submittingKey === "goal"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("goal", () =>
                api.post(`/employees/${id}/goals`, {
                  title: goalForm.title,
                  status: goalForm.status,
                  progress_percent: Number(goalForm.progress_percent),
                  target_date: goalForm.target_date || null,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Goal title" value={goalForm.title} onChange={(event) => setGoalForm((p) => ({ ...p, title: event.target.value }))} />
            <input className={inputClass} placeholder="Status" value={goalForm.status} onChange={(event) => setGoalForm((p) => ({ ...p, status: event.target.value }))} />
            <input className={inputClass} placeholder="Progress %" value={goalForm.progress_percent} onChange={(event) => setGoalForm((p) => ({ ...p, progress_percent: event.target.value }))} />
            <input type="date" className={inputClass} value={goalForm.target_date} onChange={(event) => setGoalForm((p) => ({ ...p, target_date: event.target.value }))} />
          </MutationFormSection>
        ) : null}

        <EntityTable title="Lifecycle events" rows={data.lifecycle_events} />
        {canManageLifecycle ? (
          <MutationFormSection
            title="Add lifecycle event"
            submitting={submittingKey === "lifecycle"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!id) return;
              void runMutation("lifecycle", () =>
                api.post(`/employees/${id}/lifecycle-events`, {
                  event_type: lifecycleForm.event_type,
                  title: lifecycleForm.title,
                  status: lifecycleForm.status,
                  due_at: lifecycleForm.due_at ? `${lifecycleForm.due_at}T00:00:00` : null,
                }),
              );
            }}
          >
            <input className={inputClass} placeholder="Event type" value={lifecycleForm.event_type} onChange={(event) => setLifecycleForm((p) => ({ ...p, event_type: event.target.value }))} />
            <input className={inputClass} placeholder="Title" value={lifecycleForm.title} onChange={(event) => setLifecycleForm((p) => ({ ...p, title: event.target.value }))} />
            <input className={inputClass} placeholder="Status" value={lifecycleForm.status} onChange={(event) => setLifecycleForm((p) => ({ ...p, status: event.target.value }))} />
            <input type="date" className={inputClass} value={lifecycleForm.due_at} onChange={(event) => setLifecycleForm((p) => ({ ...p, due_at: event.target.value }))} />
          </MutationFormSection>
        ) : null}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950";

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 text-neutral-900 dark:text-neutral-100">{String(value ?? "—")}</p>
    </div>
  );
}

function EntityTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">No records yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.slice(0, 6).map((row, index) => (
            <div key={`${title}-${index}`} className="rounded-lg border border-neutral-200 p-3 text-xs dark:border-neutral-800">
              {Object.entries(row)
                .slice(0, 5)
                .map(([key, value]) => (
                  <p key={key} className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium">{key}</span>: {String(value ?? "—")}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MutationFormSection({
  title,
  onSubmit,
  children,
  submitting,
}: {
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  submitting: boolean;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      <form className="mt-3 space-y-2" onSubmit={onSubmit}>
        {children}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </Button>
      </form>
    </section>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
