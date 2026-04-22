import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import type { Employee, EmployeeLeaveRequest } from "@/lib/types";

// Human: Multi-view vacation planner (timeline, calendar, table) over approved leave spanning many employees.
// Agent: FETCH employees + leave; VIEWS TimelineView|CalendarView|TableView; LOCAL date math helpers; SCALE week|month|quarter.

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "table" | "calendar" | "timeline";
type Scale = "week" | "month" | "quarter";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEFT_W = 220;
const ROW_H  = 44;
const HDR_H  = 56; // total header height (month row + day row)

const DAY_PX: Record<Scale, number> = { week: 96, month: 32, quarter: 12 };

const PALETTE = [
  "#3b82f6","#10b981","#8b5cf6","#f59e0b",
  "#f43f5e","#14b8a6","#f97316","#6366f1",
  "#ec4899","#06b6d4","#a3e635","#e879f9",
];

const MONTH_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_SHORT   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function parseDate(s: string): Date { return new Date(s + "T00:00:00"); }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function daysBetweenStr(s: string, e: string): number {
  const ms = parseDate(e).getTime() - parseDate(s).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function getRange(anchor: Date, scale: Scale): { start: Date; end: Date; days: number } {
  if (scale === "week") {
    const mon = new Date(anchor);
    mon.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    mon.setHours(0, 0, 0, 0);
    const end = addDays(mon, 13);
    return { start: mon, end, days: 14 };
  }
  if (scale === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end   = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const days  = end.getDate();
    return { start, end, days };
  }
  // quarter
  const q     = Math.floor(anchor.getMonth() / 3);
  const start = new Date(anchor.getFullYear(), q * 3, 1);
  const end   = new Date(anchor.getFullYear(), q * 3 + 3, 0);
  const days  = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { start, end, days };
}

function advance(anchor: Date, scale: Scale, dir: 1 | -1): Date {
  const d = new Date(anchor);
  if (scale === "week")    d.setDate(d.getDate() + dir * 14);
  else if (scale === "month")  d.setMonth(d.getMonth() + dir);
  else                         d.setMonth(d.getMonth() + dir * 3);
  return d;
}

function rangeLabel(anchor: Date, scale: Scale): string {
  if (scale === "week") {
    const { start, end } = getRange(anchor, scale);
    return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }
  if (scale === "month") {
    return `${MONTH_LONG[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  const q = Math.floor(anchor.getMonth() / 3) + 1;
  return `Q${q} ${anchor.getFullYear()}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

// Human: Orchestrates data loading, color mapping, and view switching for the vacation planning experience.
// Agent: STATE view,scale,anchor,employees,vacations; useCallback load; SCROLL timelineRef; PASSES props into subviews.

export default function EmployeeVacationPlannerPage() {
  const [view, setView]     = useState<View>("timeline");
  const [scale, setScale]   = useState<Scale>("quarter");
  const [anchor, setAnchor] = useState(new Date());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vacations, setVacations] = useState<EmployeeLeaveRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empData, leaveData] = await Promise.all([
        api.get<{ employees: Employee[] }>("/employees"),
        api.get<{ leave_requests: EmployeeLeaveRequest[] }>("/employees/leave"),
      ]);
      setEmployees(empData.employees ?? []);
      setVacations((leaveData.leave_requests ?? []).filter((r) => r.leave_type === "VACATION"));
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Scroll timeline to today when view/scale changes
  const scrollToToday = useCallback(() => {
    const el = timelineRef.current;
    if (!el || view !== "timeline") return;
    const { start, days } = getRange(anchor, scale);
    const dayPx  = DAY_PX[scale];
    const offset = Math.floor((Date.now() - start.getTime()) / 86_400_000);
    if (offset >= 0 && offset < days) {
      el.scrollLeft = Math.max(0, offset * dayPx - el.clientWidth / 2);
    }
  }, [view, anchor, scale]);

  useEffect(() => { scrollToToday(); }, [scrollToToday]);

  const colorOf = useCallback((empId: string) => {
    const idx = employees.findIndex((e) => e.id === empId);
    return PALETTE[idx < 0 ? 0 : idx % PALETTE.length];
  }, [employees]);

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const empName = (emp: Employee) =>
    emp.display_name ?? (`${emp.first_name} ${emp.last_name}`.trim() || emp.employee_code);

  const empInitials = (emp: Employee) => {
    const first = emp.first_name?.[0] ?? "";
    const last  = emp.last_name?.[0] ?? "";
    return (first + last).toUpperCase() || emp.employee_code.slice(0, 2).toUpperCase();
  };

  // Sort: employees with vacations first
  const orderedEmployees = useMemo(() => {
    const withVac = new Set(vacations.map((v) => v.employee_id));
    return [
      ...employees.filter((e) => withVac.has(e.id)),
      ...employees.filter((e) => !withVac.has(e.id)),
    ];
  }, [employees, vacations]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
    </div>
  );

  if (loadErr) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      {loadErr}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <Link to={ROUTES.EMPLOYEES} className="hover:text-primary-600 dark:hover:text-primary-400">Employees</Link>
            <span>/</span>
            <span>Vacation Planner</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Vacation Planner</h1>
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-1 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          {(["timeline", "calendar", "table"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                view === v
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              }`}
            >
              {v === "timeline" ? "Timeline" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "timeline" && (
        <TimelineView
          employees={orderedEmployees}
          vacations={vacations}
          colorOf={colorOf}
          empName={empName}
          empInitials={empInitials}
          scale={scale}
          setScale={setScale}
          anchor={anchor}
          setAnchor={setAnchor}
          scrollRef={timelineRef}
          onToday={() => { setAnchor(new Date()); setTimeout(scrollToToday, 50); }}
        />
      )}
      {view === "calendar" && (
        <CalendarView
          vacations={vacations}
          empById={empById}
          empName={empName}
          colorOf={colorOf}
        />
      )}
      {view === "table" && (
        <TableView
          vacations={vacations}
          empById={empById}
          empName={empName}
          colorOf={colorOf}
        />
      )}
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

// Human: Horizontal timeline rendering each employee row with leave bars aligned to the scaled date range.
// Agent: READS vacations+employees; USES scrollRef; MUTATES scale/anchor via props; COMPUTES pixel layout from DAY_PX.

function TimelineView({
  employees,
  vacations,
  colorOf,
  empName,
  empInitials,
  scale,
  setScale,
  anchor,
  setAnchor,
  scrollRef,
  onToday,
}: {
  employees: Employee[];
  vacations: EmployeeLeaveRequest[];
  colorOf: (id: string) => string;
  empName: (e: Employee) => string;
  empInitials: (e: Employee) => string;
  scale: Scale;
  setScale: (s: Scale) => void;
  anchor: Date;
  setAnchor: (d: Date) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollRef: React.RefObject<any>;
  onToday: () => void;
}) {
  const { start, end, days } = getRange(anchor, scale);
  const dayPx = DAY_PX[scale];
  const totalW = days * dayPx;

  // Build days array
  const dayArr: Date[] = [];
  for (let i = 0; i < days; i++) dayArr.push(addDays(start, i));

  // Month header groups
  const monthGroups: { label: string; days: number }[] = [];
  dayArr.forEach((d) => {
    const label = `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    const last  = monthGroups[monthGroups.length - 1];
    if (!last || last.label !== label) monthGroups.push({ label, days: 1 });
    else last.days++;
  });

  // Today
  const today = new Date();
  const todayIdx = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  const showToday = todayIdx >= 0 && todayIdx < days;

  // Pre-process vacations for the visible range
  const visStart = start.getTime();
  const visEnd   = end.getTime();

  function barProps(vac: EmployeeLeaveRequest): { left: number; width: number } | null {
    const vs = parseDate(vac.start_date);
    const ve = parseDate(vac.end_date);
    if (ve.getTime() < visStart || vs.getTime() > visEnd) return null;
    const clampStart = vs < start ? start : vs;
    const clampEnd   = ve > end   ? end   : ve;
    const left  = Math.floor((clampStart.getTime() - visStart) / 86_400_000) * dayPx;
    const width = (Math.floor((clampEnd.getTime()  - clampStart.getTime()) / 86_400_000) + 1) * dayPx;
    return { left, width };
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        {/* Scale buttons */}
        <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700">
          {(["week","month","quarter"] as Scale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-3 py-1 text-xs font-medium capitalize transition-colors first:rounded-l-lg last:rounded-r-lg ${
                scale === s
                  ? "bg-primary-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => setAnchor(advance(anchor, scale, -1))}>‹</NavBtn>
          <span className="min-w-[160px] text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            {rangeLabel(anchor, scale)}
          </span>
          <NavBtn onClick={() => setAnchor(advance(anchor, scale, 1))}>›</NavBtn>
        </div>

        <button
          onClick={onToday}
          className="rounded-lg border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Today
        </button>

        {/* Jump-to-date */}
        <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Jump to</span>
          <input
            type="date"
            className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
            onChange={(e) => { if (e.target.value) setAnchor(parseDate(e.target.value)); }}
          />
        </label>

        <div className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
          {employees.length} employees · {vacations.length} vacation{vacations.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Grid */}
      <div className="flex" style={{ minHeight: employees.length * ROW_H + HDR_H + 1 }}>
        {/* Left panel: employee names */}
        <div style={{ width: LEFT_W, flexShrink: 0 }}>
          {/* Header spacer */}
          <div
            style={{ height: HDR_H }}
            className="border-b border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
          />
          {/* Employee rows */}
          {employees.map((emp) => (
            <div
              key={emp.id}
              style={{ height: ROW_H }}
              className="flex items-center gap-2.5 border-b border-r border-neutral-100 px-3 dark:border-neutral-800"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: colorOf(emp.id) }}
              >
                {empInitials(emp)}
              </span>
              <span className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {empName(emp)}
              </span>
            </div>
          ))}
        </div>

        {/* Right panel: scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto">
          <div style={{ width: totalW, position: "relative" }}>
            {/* Month header row */}
            <div className="flex" style={{ height: 28 }}>
              {monthGroups.map((g, i) => (
                <div
                  key={i}
                  style={{ width: g.days * dayPx }}
                  className="overflow-hidden border-b border-r border-neutral-200 bg-neutral-50 px-2 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{g.label}</span>
                </div>
              ))}
            </div>

            {/* Day header row */}
            <div className="flex" style={{ height: 28 }}>
              {dayArr.map((d, i) => {
                const isToday = isSameDay(d, today);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{ width: dayPx }}
                    className={`flex flex-col items-center justify-center border-b border-r text-center transition-colors ${
                      isToday
                        ? "border-r-primary-300 bg-primary-50 dark:bg-primary-900/30"
                        : isWeekend
                          ? "border-neutral-200 bg-neutral-100/50 dark:border-neutral-800 dark:bg-neutral-800/30"
                          : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    {dayPx >= 24 && (
                      <span className={`text-[10px] leading-none ${isToday ? "font-bold text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-neutral-500"}`}>
                        {d.getDate()}
                      </span>
                    )}
                    {dayPx >= 56 && (
                      <span className="text-[9px] text-neutral-400 dark:text-neutral-600">{DAY_SHORT[d.getDay()]}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Employee rows with vacation bars */}
            {employees.map((emp) => {
              const empVacs = vacations.filter((v) => v.employee_id === emp.id);
              const color   = colorOf(emp.id);
              return (
                <div key={emp.id} style={{ height: ROW_H, position: "relative" }} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  {/* Weekend tint stripes */}
                  {dayArr.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    if (!isWeekend) return null;
                    return (
                      <div
                        key={i}
                        style={{ position: "absolute", left: i * dayPx, top: 0, width: dayPx, height: ROW_H }}
                        className="bg-neutral-100/50 dark:bg-neutral-800/20"
                      />
                    );
                  })}

                  {/* Today vertical highlight */}
                  {showToday && (
                    <div
                      style={{ position: "absolute", left: todayIdx * dayPx, top: 0, width: dayPx, height: ROW_H }}
                      className="bg-primary-50/60 dark:bg-primary-900/20"
                    />
                  )}

                  {/* Vacation bars */}
                  {empVacs.map((vac) => {
                    const bp = barProps(vac);
                    if (!bp) return null;
                    const { left, width } = bp;
                    const isPending  = vac.status === "PENDING";
                    const isDenied   = vac.status === "DENIED";
                    return (
                      <div
                        key={vac.id}
                        title={`${empName(emp)}: ${vac.start_date} → ${vac.end_date} (${vac.status})${vac.reason ? ` — ${vac.reason}` : ""}`}
                        style={{
                          position: "absolute",
                          left,
                          width,
                          top: 7,
                          height: ROW_H - 14,
                          backgroundColor: color,
                          opacity: isPending ? 0.55 : isDenied ? 0.25 : 1,
                          borderRadius: 5,
                          border: isPending ? `2px dashed ${color}` : isDenied ? `2px solid ${color}` : "none",
                          boxSizing: "border-box",
                        }}
                        className="flex cursor-pointer items-center overflow-hidden px-2 transition-opacity hover:opacity-90"
                      >
                        {width > 48 && (
                          <span className="truncate text-[10px] font-semibold text-white drop-shadow">
                            {vac.reason ?? "Vacation"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Today vertical line (on top) */}
            {showToday && (
              <div
                style={{
                  position: "absolute",
                  left: todayIdx * dayPx + Math.floor(dayPx / 2) - 1,
                  top: 0,
                  width: 2,
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
                className="bg-primary-500/60"
              />
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-neutral-100 px-4 py-2 dark:border-neutral-800">
        {[
          { label: "Approved", style: { display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#10b981" } },
          { label: "Pending",  style: { display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#10b981", opacity: 0.5, border: "2px dashed #10b981" } },
          { label: "Denied",   style: { display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "#10b981", opacity: 0.25 } },
        ].map(({ label, style }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span style={style} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

// Human: Month-grid calendar highlighting overlapping leave blocks per employee with color coding.
// Agent: STATE monthAnchor; MAP vacations into day cells; READS empById,colorOf; PURE layout besides local month nav.

function CalendarView({
  vacations,
  empById,
  empName,
  colorOf,
}: {
  vacations: EmployeeLeaveRequest[];
  empById: Map<string, Employee>;
  empName: (e: Employee) => string;
  colorOf: (id: string) => string;
}) {
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const year  = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  // Build calendar grid (6 weeks × 7 days)
  const firstDay    = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date();

  const gridDays: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) gridDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridDays.push(new Date(year, month, d));
  while (gridDays.length % 7 !== 0) gridDays.push(null);

  // For each calendar day, find which vacations cover it
  function vacationsOnDay(date: Date): EmployeeLeaveRequest[] {
    const ts = date.getTime();
    return vacations.filter((v) => {
      const vs = parseDate(v.start_date).getTime();
      const ve = parseDate(v.end_date).getTime();
      return ts >= vs && ts <= ve;
    });
  }

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < gridDays.length; i += 7) weeks.push(gridDays.slice(i, i + 7));

  // Active employees this month (have vacation overlapping the month)
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd   = new Date(year, month + 1, 0).getTime();
  const activeVacs = vacations.filter((v) => {
    const vs = parseDate(v.start_date).getTime();
    const ve = parseDate(v.end_date).getTime();
    return ve >= monthStart && vs <= monthEnd;
  });
  const activeEmpIds = [...new Set(activeVacs.map((v) => v.employee_id))];

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <NavBtn onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</NavBtn>
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {MONTH_LONG[month]} {year}
        </h2>
        <NavBtn onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</NavBtn>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              if (!day) return (
                <div key={di} className="min-h-[100px] border-b border-r border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-950/50" />
              );
              const dayCoveredVacs = vacationsOnDay(day);
              const isToday  = isSameDay(day, today);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={di}
                  className={`min-h-[100px] border-b border-r border-neutral-100 p-2 dark:border-neutral-800 ${
                    isWeekend ? "bg-neutral-50/80 dark:bg-neutral-950/50" : ""
                  }`}
                >
                  <div className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? "bg-primary-600 text-white"
                      : "text-neutral-700 dark:text-neutral-300"
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayCoveredVacs.slice(0, 3).map((vac) => {
                      const emp = empById.get(vac.employee_id);
                      const name = emp ? empName(emp) : (vac.employee_name ?? vac.employee_code ?? "Unknown");
                      const color = colorOf(vac.employee_id);
                      const isStart = isSameDay(day, parseDate(vac.start_date));
                      return (
                        <div
                          key={vac.id}
                          title={`${name} (${vac.status})`}
                          style={{ backgroundColor: color, opacity: vac.status === "PENDING" ? 0.6 : vac.status === "DENIED" ? 0.3 : 1 }}
                          className="flex items-center gap-1 overflow-hidden rounded px-1.5 py-0.5"
                        >
                          {isStart && <span className="text-[10px] font-semibold text-white/90 truncate">{name}</span>}
                          {!isStart && <span style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.6)", borderRadius: 1, display: "block" }} />}
                        </div>
                      );
                    })}
                    {dayCoveredVacs.length > 3 && (
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500">+{dayCoveredVacs.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend: active employees this month */}
      {activeEmpIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">On leave this month:</span>
          {activeEmpIds.map((id) => {
            const emp = empById.get(id);
            if (!emp) return null;
            return (
              <span key={id} className="flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(id) }} />
                {empName(emp)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

type SortKey = "employee" | "start" | "end" | "days" | "status";

// Human: Sortable searchable table summarizing each leave request with employee context and status chips.
// Agent: STATE search,sortKey,sortDir; DERIVES filtered rows; READS vacations+empById; CLIENT-SIDE sort only.

function TableView({
  vacations,
  empById,
  empName,
  colorOf,
}: {
  vacations: EmployeeLeaveRequest[];
  empById: Map<string, Employee>;
  empName: (e: Employee) => string;
  colorOf: (id: string) => string;
}) {
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort]         = useState<SortKey>("start");
  const [sortDir, setSortDir]   = useState<1 | -1>(-1);

  const toggle = (key: SortKey) => {
    if (sort === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSort(key); setSortDir(1); }
  };

  const filtered = useMemo(() => {
    let rows = vacations;
    if (statusFilter !== "ALL") rows = rows.filter((v) => v.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((v) => {
        const emp = empById.get(v.employee_id);
        const name = emp ? empName(emp) : "";
        return (
          name.toLowerCase().includes(q) ||
          (v.reason ?? "").toLowerCase().includes(q) ||
          v.status.toLowerCase().includes(q) ||
          v.start_date.includes(q) ||
          v.end_date.includes(q)
        );
      });
    }
    rows = [...rows].sort((a, b) => {
      let av = 0, bv = 0, as_ = "", bs_ = "";
      if (sort === "employee") {
        const an = empById.get(a.employee_id);
        const bn = empById.get(b.employee_id);
        as_ = an ? empName(an) : "";
        bs_ = bn ? empName(bn) : "";
        return sortDir * as_.localeCompare(bs_);
      }
      if (sort === "start")  return sortDir * a.start_date.localeCompare(b.start_date);
      if (sort === "end")    return sortDir * a.end_date.localeCompare(b.end_date);
      if (sort === "status") return sortDir * a.status.localeCompare(b.status);
      if (sort === "days") {
        av = daysBetweenStr(a.start_date, a.end_date);
        bv = daysBetweenStr(b.start_date, b.end_date);
        return sortDir * (av - bv);
      }
      return 0;
    });
    return rows;
  }, [vacations, statusFilter, search, sort, sortDir, empById, empName]);

  const STATUS_CLS: Record<string, string> = {
    APPROVED:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    PENDING:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    DENIED:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    CANCELLED: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };

  function Th({ label, k }: { label: string; k: SortKey }) {
    const active = sort === k;
    return (
      <th
        className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
        onClick={() => toggle(k)}
      >
        {label} {active ? (sortDir === 1 ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-soft-lg dark:border-neutral-800 dark:bg-neutral-900">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <input
          type="search"
          placeholder="Search employee, reason…"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="DENIED">Denied</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-400 dark:text-neutral-500">No vacation requests found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-950">
              <tr>
                <Th label="Employee" k="employee" />
                <Th label="Start" k="start" />
                <Th label="End" k="end" />
                <Th label="Days" k="days" />
                <Th label="Status" k="status" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((vac) => {
                const emp   = empById.get(vac.employee_id);
                const name  = emp ? empName(emp) : (vac.employee_name ?? vac.employee_code ?? "Unknown");
                const days  = daysBetweenStr(vac.start_date, vac.end_date);
                const color = colorOf(vac.employee_id);
                return (
                  <tr key={vac.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 font-mono text-xs">{vac.start_date}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 font-mono text-xs">{vac.end_date}</td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                      {days} day{days !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[vac.status] ?? STATUS_CLS.CANCELLED}`}>
                        {vac.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 max-w-[200px] truncate">
                      {vac.reason ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Shared tiny components ───────────────────────────────────────────────────

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}
