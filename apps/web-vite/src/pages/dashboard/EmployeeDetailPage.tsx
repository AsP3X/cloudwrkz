import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

type EmployeeDetailResponse = {
  employee: Record<string, unknown>;
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
  const canView = can("modules.employees.view");
  const canEdit = can("employees.update");
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EmployeeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const response = await api.get<EmployeeDetailResponse>(`/employees/${id}`);
      setData(response);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">{fullName || "Employee"}</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Code: {String(employee.employee_code ?? "—")} · Status: {String(employee.status ?? "—")}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit ? (
            <Button asChild variant="outline">
              <Link to={`${ROUTES.EMPLOYEES}/${id}/edit`}>Edit profile</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to={ROUTES.EMPLOYEES}>Back to list</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Core profile" content={employee} />
        <Card title="Compensation" content={data.compensation} />
        <Card title="Assets" content={data.assets} />
        <Card title="Skills" content={data.skills} />
        <Card title="Certifications" content={data.certifications} />
        <Card title="Performance reviews" content={data.performance_reviews} />
        <Card title="Goals" content={data.goals} />
        <Card title="Lifecycle events" content={data.lifecycle_events} />
      </div>
    </div>
  );
}

function Card({ title, content }: { title: string; content: unknown }) {
  return (
    <section className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      </div>
      <pre className="p-4 text-xs overflow-auto text-neutral-700 dark:text-neutral-300">
        {JSON.stringify(content, null, 2)}
      </pre>
    </section>
  );
}
