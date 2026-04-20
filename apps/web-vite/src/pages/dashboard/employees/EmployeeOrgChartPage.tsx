// Human: Org chart page fetches all employees and renders them as an interactive tree based on
// manager_employee_id relationships. Root nodes are employees with no manager.
// Agent: CALLS GET /employees/org-chart; RENDERS recursive OrgNode components; no mutations.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { OrgChartNode } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

export default function EmployeeOrgChartPage() {
  const { can } = useAuth();
  const canView = can("modules.employees.view");
  const [nodes, setNodes] = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ nodes: OrgChartNode[] }>("/employees/org-chart");
      setNodes(data.nodes ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load org chart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to the Employees module." primaryHref={ROUTES.DASHBOARD} primaryLabel="Back to Dashboard" />;
  }

  // Human: Build an adjacency map from manager_employee_id so we can recursively render trees.
  // Agent: CONSTRUCTS childrenMap: Record<string | "root", OrgChartNode[]>; root = nodes where manager_employee_id is null.
  const childrenMap: Record<string, OrgChartNode[]> = {};
  for (const node of nodes) {
    const key = node.manager_employee_id ?? "root";
    if (!childrenMap[key]) childrenMap[key] = [];
    childrenMap[key].push(node);
  }

  const roots = childrenMap["root"] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Org Chart</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            Visual organisation tree — {nodes.length} employee{nodes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link to={ROUTES.EMPLOYEES} className="text-sm text-primary-600 hover:underline dark:text-primary-400">
          ← Directory
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-white p-6 text-red-600 dark:border-red-900/40 dark:bg-neutral-900 dark:text-red-400">
          {error}
        </div>
      )}
      {!loading && !error && roots.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-500 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          No employees found. Add employees with managers to see the org tree.
        </div>
      )}
      {!loading && !error && roots.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-3">
            {roots.map((root) => (
              <OrgNode key={root.id} node={root} childrenMap={childrenMap} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrgNode({
  node,
  childrenMap,
  depth,
}: {
  node: OrgChartNode;
  childrenMap: Record<string, OrgChartNode[]>;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = childrenMap[node.id] ?? [];
  const name = node.display_name ?? `${node.first_name} ${node.last_name}`;

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    ON_LEAVE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    TERMINATED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    DRAFT: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  };

  return (
    <div className={depth > 0 ? "ml-8 border-l-2 border-neutral-200 pl-4 dark:border-neutral-700" : ""}>
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
        {children.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-xs font-bold text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {expanded ? "▾" : "▸"}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`${ROUTES.EMPLOYEES}/${node.id}`}
            className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            {name}
          </Link>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {node.job_title ?? "—"}
            {node.department ? ` · ${node.department}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[node.status] ?? statusColors.DRAFT}`}>
          {node.status}
        </span>
        <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-600">
          {node.employee_code}
        </span>
        {children.length > 0 && (
          <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
            {children.length} direct
          </span>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <OrgNode key={child.id} node={child} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
