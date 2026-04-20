// Human: Org chart page renders a top-down tree with department-coloured cards,
// circular avatar initials, and SVG-style CSS connector lines.
// Agent: FETCHES GET /employees/org-chart; BUILDS childrenMap; RENDERS OrgTree recursively.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { OrgChartNode } from "@/lib/types";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { useAuth } from "@/components/providers/AuthProvider";

// ─── Palette ──────────────────────────────────────────────────────────────────

const DEPT_PALETTE = [
  { border: "#3b82f6", bg: "#eff6ff", avatar: "#3b82f6", label: "#1d4ed8" },  // blue
  { border: "#f59e0b", bg: "#fffbeb", avatar: "#d97706", label: "#92400e" },  // amber
  { border: "#14b8a6", bg: "#f0fdfa", avatar: "#0d9488", label: "#0f766e" },  // teal
  { border: "#8b5cf6", bg: "#f5f3ff", avatar: "#7c3aed", label: "#5b21b6" },  // violet
  { border: "#f43f5e", bg: "#fff1f2", avatar: "#e11d48", label: "#9f1239" },  // rose
  { border: "#10b981", bg: "#ecfdf5", avatar: "#059669", label: "#065f46" },  // emerald
  { border: "#f97316", bg: "#fff7ed", avatar: "#ea580c", label: "#7c2d12" },  // orange
  { border: "#6366f1", bg: "#eef2ff", avatar: "#4f46e5", label: "#3730a3" },  // indigo
] as const;

type DeptColor = (typeof DEPT_PALETTE)[number];

const LINE = "#d1d5db"; // connector line colour (gray-300)

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EmployeeOrgChartPage() {
  const { can } = useAuth();
  const canView = can("modules.employees.view");
  const [nodes, setNodes]   = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ nodes: OrgChartNode[] }>("/employees/org-chart");
      setNodes(data.nodes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load org chart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Department → palette index (stable, first-seen order)
  const deptColorMap = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const n of nodes) {
      const k = n.department ?? "Other";
      if (!map.has(k)) { map.set(k, i % DEPT_PALETTE.length); i++; }
    }
    return map;
  }, [nodes]);

  // Adjacency map id → children
  const childrenMap = useMemo(() => {
    const m: Record<string, OrgChartNode[]> = {};
    for (const n of nodes) {
      const k = n.manager_employee_id ?? "root";
      (m[k] ??= []).push(n);
    }
    return m;
  }, [nodes]);

  const roots = childrenMap["root"] ?? [];

  const colorOf = useCallback((dept: string | null): DeptColor => {
    const idx = deptColorMap.get(dept ?? "Other") ?? 0;
    return DEPT_PALETTE[idx % DEPT_PALETTE.length];
  }, [deptColorMap]);

  if (!canView) {
    return <AccessDeniedWarning message="You don't have access to the Employees module." primaryHref={ROUTES.DASHBOARD} primaryLabel="Back to Dashboard" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Org Chart</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {nodes.length} employee{nodes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link to={ROUTES.EMPLOYEES} className="text-sm text-primary-600 hover:underline dark:text-primary-400">
          ← Directory
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {!loading && !error && roots.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-neutral-500 shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
          No employees found. Assign managers to employees to see the org tree.
        </div>
      )}

      {!loading && !error && roots.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">

          {/* Legend */}
          {deptColorMap.size > 0 && (
            <div className="absolute right-4 top-4 z-10 min-w-[140px] rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                Legend
              </p>
              <div className="space-y-2">
                {[...deptColorMap.entries()].map(([dept, colorIdx]) => {
                  const c = DEPT_PALETTE[colorIdx % DEPT_PALETTE.length];
                  return (
                    <div key={dept} className="flex items-center gap-2">
                      <div
                        className="h-3 w-5 rounded-sm border"
                        style={{ borderColor: c.border, backgroundColor: c.bg }}
                      />
                      <span className="text-xs text-neutral-700 dark:text-neutral-300">{dept}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scrollable tree canvas */}
          <div className="overflow-auto p-8 pb-12 pt-6">
            <div className="inline-flex flex-col items-center gap-0">
              {roots.map((root) => (
                <OrgTree key={root.id} node={root} childrenMap={childrenMap} colorOf={colorOf} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OrgTree ─────────────────────────────────────────────────────────────────

function OrgTree({
  node,
  childrenMap,
  colorOf,
}: {
  node: OrgChartNode;
  childrenMap: Record<string, OrgChartNode[]>;
  colorOf: (dept: string | null) => DeptColor;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = childrenMap[node.id] ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <OrgCard node={node} colorOf={colorOf} />

      {/* Expand / collapse trigger */}
      {hasChildren && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ borderColor: colorOf(node.department).border, color: colorOf(node.department).label }}
          className="relative z-10 -mt-px flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white text-[10px] font-bold shadow-sm transition-colors hover:opacity-80 dark:bg-neutral-900"
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "−" : "+"}
        </button>
      )}

      {/* Vertical line + children row */}
      {hasChildren && expanded && (
        <div className="flex flex-col items-center">
          {/* Short vertical line from button to horizontal bar */}
          <div style={{ width: 2, height: 12, backgroundColor: LINE }} />

          {/* Horizontal bar + children */}
          <div className="flex items-start">
            {children.map((child, idx) => (
              <div
                key={child.id}
                className="flex flex-col items-center"
                style={{ padding: "0 10px" }}
              >
                {/* Connector: horizontal segment + vertical drop */}
                <ChildConnector idx={idx} total={children.length} />
                <OrgTree node={child} childrenMap={childrenMap} colorOf={colorOf} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OrgCard ─────────────────────────────────────────────────────────────────

function OrgCard({
  node,
  colorOf,
}: {
  node: OrgChartNode;
  colorOf: (dept: string | null) => DeptColor;
}) {
  const c = colorOf(node.department);
  const fullName = `${node.first_name} ${node.last_name}`.trim();
  const name = node.display_name ?? (fullName || node.employee_code);
  const initials = ((node.first_name?.[0] ?? "") + (node.last_name?.[0] ?? "")).toUpperCase()
    || node.employee_code.slice(0, 2).toUpperCase();

  return (
    <Link
      to={`${ROUTES.EMPLOYEES}/${node.id}`}
      className="group flex w-[148px] flex-col items-center rounded-xl border-2 p-3 shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: c.border, backgroundColor: c.bg }}
    >
      {/* Avatar */}
      <div
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: c.avatar }}
      >
        {initials}
      </div>

      {/* Name */}
      <p
        className="mb-0.5 text-center text-[12px] font-bold leading-tight group-hover:underline"
        style={{ color: c.label }}
      >
        {name}
      </p>

      {/* Job title */}
      {node.job_title ? (
        <p className="text-center text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
          {node.job_title}
        </p>
      ) : null}

      {/* Department */}
      {node.department ? (
        <p
          className="mt-1.5 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: c.label, backgroundColor: `${c.border}18` }}
        >
          {node.department}
        </p>
      ) : null}
    </Link>
  );
}

// ─── ChildConnector ───────────────────────────────────────────────────────────
// Draws the elbow/T-bar connector between the horizontal line and each child card.

function ChildConnector({ idx, total }: { idx: number; total: number }) {
  const CONNECTOR_H = 20;

  // Single child: straight vertical line
  if (total === 1) {
    return (
      <div style={{ width: 2, height: CONNECTOR_H, backgroundColor: LINE, margin: "0 auto" }} />
    );
  }

  const isFirst = idx === 0;
  const isLast  = idx === total - 1;

  return (
    <div style={{ height: CONNECTOR_H, width: "100%", position: "relative" }}>
      {/* Horizontal segment of the connecting bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left:  isFirst ? "50%" : 0,
          right: isLast  ? "50%" : 0,
          height: 2,
          backgroundColor: LINE,
        }}
      />
      {/* Vertical drop from bar to child */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 2,
          height: CONNECTOR_H,
          backgroundColor: LINE,
        }}
      />
    </div>
  );
}
