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
import { useTheme } from "@/components/providers/ThemeProvider";

// ─── Palette ──────────────────────────────────────────────────────────────────

const DEPT_PALETTE = [
  { border: "#3b82f6", bgLight: "#eff6ff", bgDark: "#172554", avatarLight: "#3b82f6", avatarDark: "#60a5fa", labelLight: "#1d4ed8", labelDark: "#93c5fd" }, // blue
  { border: "#f59e0b", bgLight: "#fffbeb", bgDark: "#451a03", avatarLight: "#d97706", avatarDark: "#fbbf24", labelLight: "#92400e", labelDark: "#fcd34d" }, // amber
  { border: "#14b8a6", bgLight: "#f0fdfa", bgDark: "#042f2e", avatarLight: "#0d9488", avatarDark: "#2dd4bf", labelLight: "#0f766e", labelDark: "#5eead4" }, // teal
  { border: "#8b5cf6", bgLight: "#f5f3ff", bgDark: "#2e1065", avatarLight: "#7c3aed", avatarDark: "#a78bfa", labelLight: "#5b21b6", labelDark: "#c4b5fd" }, // violet
  { border: "#f43f5e", bgLight: "#fff1f2", bgDark: "#4c0519", avatarLight: "#e11d48", avatarDark: "#fb7185", labelLight: "#9f1239", labelDark: "#fda4af" }, // rose
  { border: "#10b981", bgLight: "#ecfdf5", bgDark: "#022c22", avatarLight: "#059669", avatarDark: "#34d399", labelLight: "#065f46", labelDark: "#6ee7b7" }, // emerald
  { border: "#f97316", bgLight: "#fff7ed", bgDark: "#431407", avatarLight: "#ea580c", avatarDark: "#fb923c", labelLight: "#7c2d12", labelDark: "#fdba74" }, // orange
  { border: "#6366f1", bgLight: "#eef2ff", bgDark: "#1e1b4b", avatarLight: "#4f46e5", avatarDark: "#818cf8", labelLight: "#3730a3", labelDark: "#a5b4fc" }, // indigo
] as const;

type DeptColor = (typeof DEPT_PALETTE)[number];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EmployeeOrgChartPage() {
  const { can } = useAuth();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
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
                        style={{ borderColor: c.border, backgroundColor: isDark ? c.bgDark : c.bgLight }}
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
            <div className="flex min-w-full justify-center">
              <div className="inline-flex flex-col items-center gap-0">
                {roots.map((root) => (
                  <OrgTree key={root.id} node={root} childrenMap={childrenMap} colorOf={colorOf} isDark={isDark} />
                ))}
              </div>
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
  isDark,
}: {
  node: OrgChartNode;
  childrenMap: Record<string, OrgChartNode[]>;
  colorOf: (dept: string | null) => DeptColor;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = childrenMap[node.id] ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <OrgCard node={node} colorOf={colorOf} isDark={isDark} />

      {/* Expand / collapse trigger */}
      {hasChildren && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            borderColor: colorOf(node.department).border,
            color: isDark ? colorOf(node.department).labelDark : colorOf(node.department).labelLight,
          }}
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
          <div style={{ width: 2, height: 12, backgroundColor: isDark ? "#475569" : "#d1d5db" }} />

          {/* Horizontal bar + children */}
          <div className="flex items-start">
            {children.map((child, idx) => (
              <div
                key={child.id}
                className="flex flex-col items-center"
                style={{ padding: "0 10px" }}
              >
                {/* Connector: horizontal segment + vertical drop */}
                <ChildConnector idx={idx} total={children.length} lineColor={isDark ? "#475569" : "#d1d5db"} />
                <OrgTree node={child} childrenMap={childrenMap} colorOf={colorOf} isDark={isDark} />
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
  isDark,
}: {
  node: OrgChartNode;
  colorOf: (dept: string | null) => DeptColor;
  isDark: boolean;
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
      style={{ borderColor: c.border, backgroundColor: isDark ? c.bgDark : c.bgLight }}
    >
      {/* Avatar */}
      <div
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: isDark ? c.avatarDark : c.avatarLight }}
      >
        {initials}
      </div>

      {/* Name */}
      <p
        className="mb-0.5 text-center text-[12px] font-bold leading-tight group-hover:underline"
        style={{ color: isDark ? c.labelDark : c.labelLight }}
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
          style={{ color: isDark ? c.labelDark : c.labelLight, backgroundColor: `${c.border}22` }}
        >
          {node.department}
        </p>
      ) : null}
    </Link>
  );
}

// ─── ChildConnector ───────────────────────────────────────────────────────────
// Draws the elbow/T-bar connector between the horizontal line and each child card.

function ChildConnector({ idx, total, lineColor }: { idx: number; total: number; lineColor: string }) {
  const CONNECTOR_H = 20;

  // Single child: straight vertical line
  if (total === 1) {
    return (
      <div style={{ width: 2, height: CONNECTOR_H, backgroundColor: lineColor, margin: "0 auto" }} />
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
          backgroundColor: lineColor,
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
          backgroundColor: lineColor,
        }}
      />
    </div>
  );
}
