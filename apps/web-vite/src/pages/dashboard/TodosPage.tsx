import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import type { Todo } from "@/lib/types";
import { TaskViewToggle, getInitialTaskViewMode, saveTaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import type { TaskViewMode } from "@/components/features/tasks/TaskViewToggle";
import { TaskFilterButton } from "@/components/features/tasks/TaskFilterButton";
import { TaskFilterLoader } from "@/components/features/tasks/TaskFilterLoader";
import { StandaloneTaskList } from "@/components/features/tasks/StandaloneTaskList";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";
import { AccessIssueTicketDialog } from "@/components/features/tickets/AccessIssueTicketDialog";

// Human: Task list hub with filters, persisted view mode, standalone list rendering, and todos module RBAC.
// Agent: FETCH /todos; TaskViewToggle persistence; READS can("modules.todos.view"); REFRESH via load callback.

// Human: Page shell handling permission denial early, otherwise managing todos state, filters, and list refetch.
// Agent: STATE todos,loading,viewMode; useRef filter snapshot; useCallback load; CONDITIONAL AccessDeniedWarning.

export default function TodosPage() {
  const { user, can } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);

  if (!can("modules.todos.view")) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the ToDo module. Please contact an administrator.
            If you believe this is a mistake, you can also create a support ticket.
          </>
        }
        primaryLabel="Create Ticket"
        customPrimary={
          <AccessIssueTicketDialog
            primaryLabel="Create Ticket"
            hiddenFields={{ context: "todos_module" }}
            dialogDescription="If you believe you should have access to the ToDo module, please describe why. Your explanation will be included in the support ticket."
          />
        }
        secondaryHref={ROUTES.DASHBOARD}
        secondaryLabel="Back to Dashboard"
      />
    );
  }
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<TaskViewMode>("table");
  const [isDesktop, setIsDesktop] = useState(false);
  const [showBulkSelect, setShowBulkSelect] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initial = getInitialTaskViewMode();
    const updateIsDesktop = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktop(desktop);
      if (!desktop && initial === "kanban") {
        setViewMode("table");
        saveTaskViewMode("table");
      } else {
        setViewMode(initial);
      }
    };
    updateIsDesktop();
    window.addEventListener("resize", updateIsDesktop);
    return () => window.removeEventListener("resize", updateIsDesktop);
  }, []);

  const handleViewChange = (mode: TaskViewMode) => {
    setViewMode(mode);
    saveTaskViewMode(mode);
  };

  const fetchTodos = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryString = searchParams.toString();
      const path = queryString ? `/todos?${queryString}` : "/todos";
      const data = await api.get<{ todos: Todo[] }>(path);
      setTodos(data.todos);
    } catch {
      setTodos([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TaskFilterLoader />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">ToDos</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Create and manage todos. Todos can work independently or be linked to tickets when needed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TaskViewToggle
            currentView={viewMode === "kanban" && !isDesktop ? "table" : viewMode}
            onViewChange={handleViewChange}
            showKanban={isDesktop}
          />
          <TaskFilterButton />
          <div className="relative" ref={menuRef}>
            <Button variant="outline" size="md" aria-label="More options" onClick={() => setMenuOpen((o) => !o)}>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between gap-2"
                  onClick={() => { setShowBulkSelect((on) => !on); setMenuOpen(false); }}
                >
                  <span>Select</span>
                  {showBulkSelect && (
                    <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <Link to="/dashboard/todos/new" className="block w-full px-4 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={() => setMenuOpen(false)}>
                  Create
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {todos.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-12 text-center">
          <svg className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">No todos yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">Get started by creating your first todo</p>
          <Link to="/dashboard/todos/new">
            <Button variant="primary">Create</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            Showing {todos.length} task{todos.length !== 1 ? "s" : ""}
          </div>
          <StandaloneTaskList
            tasks={todos as unknown as Parameters<typeof StandaloneTaskList>[0]["tasks"]}
            viewMode={viewMode}
            canManage={true}
            showBulkSelect={showBulkSelect}
            userTimezone={user?.timezone || "UTC"}
            onRefresh={fetchTodos}
          />
        </>
      )}
    </div>
  );
}
