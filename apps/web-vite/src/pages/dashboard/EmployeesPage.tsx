import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";
import { EmployeeStatsBar } from "@/components/features/employees/EmployeeStatsBar";

export default function EmployeesPage() {
  const { can } = useAuth();
  const canView = can("modules.employees.view");
  const canCreate = can("employees.create");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ employees: Employee[] }>("/employees");
      setEmployees(data.employees ?? []);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Employees</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            ERP-ERM employee records, lifecycle, and workforce data.
          </p>
        </div>
      </div>

      {!loading ? (
        <EmployeeStatsBar
          total={employees.length}
          active={employees.filter((e) => e.status === "ACTIVE").length}
          onLeave={employees.filter((e) => e.status === "ON_LEAVE").length}
          terminated={employees.filter((e) => e.status === "TERMINATED").length}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-10 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">No employees found.</p>
          {canCreate ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
              Use your HR import or API integration to add employees.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700 text-left">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td className="px-4 py-3">
                    <Link className="text-primary-600 dark:text-primary-400 hover:underline" to={`${ROUTES.EMPLOYEES}/${employee.id}`}>
                      {employee.display_name || `${employee.first_name} ${employee.last_name}`}
                    </Link>
                    <p className="text-xs text-neutral-500">Code: {employee.employee_code}</p>
                  </td>
                  <td className="px-4 py-3">{employee.department ?? "—"}</td>
                  <td className="px-4 py-3">{employee.job_title ?? "—"}</td>
                  <td className="px-4 py-3">{employee.status}</td>
                  <td className="px-4 py-3">{employee.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to={ROUTES.ADMIN_BACKGROUND_JOBS}>View background jobs</Link>
        </Button>
      </div>
    </div>
  );
}
