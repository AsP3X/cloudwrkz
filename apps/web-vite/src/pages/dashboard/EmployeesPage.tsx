import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { Employee } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";
import { EmployeeStatsBar } from "@/components/features/employees/EmployeeStatsBar";
import { CreateEmployeeDialog } from "@/components/features/employees/CreateEmployeeDialog/CreateEmployeeDialog";

// Human: Directory of employees with filters, stats, and a gated create dialog for HR operators.
// Agent: GET /employees; READS can(modules.employees.view, employees.create); LOCAL filters query/status/dept/location.

export default function EmployeesPage() {
  const { can } = useAuth();
  const canView = can("modules.employees.view");
  const canCreate = can("employees.create");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);

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

  const uniqueDepartments = Array.from(
    new Set(employees.map((employee) => employee.department).filter(Boolean)),
  ) as string[];
  const uniqueLocations = Array.from(
    new Set(employees.map((employee) => employee.location).filter(Boolean)),
  ) as string[];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) => {
    if (statusFilter !== "ALL" && employee.status !== statusFilter) return false;
    if (departmentFilter !== "ALL" && employee.department !== departmentFilter) return false;
    if (locationFilter !== "ALL" && employee.location !== locationFilter) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      employee.employee_code,
      employee.display_name ?? "",
      employee.first_name,
      employee.last_name,
      employee.work_email ?? "",
      employee.department ?? "",
      employee.job_title ?? "",
      employee.location ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedQuery);
  });

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
        {canCreate ? (
          <Button type="button" onClick={() => setCreateEmployeeOpen(true)}>
            Add employee
          </Button>
        ) : null}
      </div>

      {canCreate ? (
        <CreateEmployeeDialog
          open={createEmployeeOpen}
          onOpenChange={setCreateEmployeeOpen}
          onSuccess={() => void load()}
        />
      ) : null}

      {!loading ? (
        <EmployeeStatsBar
          total={employees.length}
          active={employees.filter((e) => e.status === "ACTIVE").length}
          onLeave={employees.filter((e) => e.status === "ON_LEAVE").length}
          terminated={employees.filter((e) => e.status === "TERMINATED").length}
        />
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, email..."
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="TERMINATED">Terminated</option>
          </select>
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="ALL">All departments</option>
            {uniqueDepartments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <select
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="ALL">All locations</option>
            {uniqueLocations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-10 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">No employees found.</p>
          {canCreate ? (
            <div className="mt-5 flex flex-col items-center gap-3">
              <p className="text-sm text-neutral-500 dark:text-neutral-500 max-w-md">
                Add your first record here, or use your HR import and API integrations for bulk data.
              </p>
              <Button type="button" onClick={() => setCreateEmployeeOpen(true)}>
                Add employee
              </Button>
            </div>
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
              {filteredEmployees.map((employee) => (
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

    </div>
  );
}
