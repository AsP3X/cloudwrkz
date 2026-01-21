import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTodos } from "@/server/actions/todos";
import { hasPermission } from "@/lib/utils/permissions";
import { TaskFilterButton } from "@/components/features/tasks/TaskFilterButton";
import { TaskFilterLoader } from "@/components/features/tasks/TaskFilterLoader";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TasksPageClient } from "./TasksPageClient";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TodosPageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignee?: string;
    link?: string;
    kind?: string;
    sort?: string;
  }>;
}

export default async function TodosPage({ searchParams }: TodosPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  const canViewTodos = await canUserViewModule(user.id, MODULE_KEYS.TODOS);

  if (!canViewTodos) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the ToDo module. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Build filters from search params
  const tasks = await getAllTodos({
    status: params.status,
    priority: params.priority,
    assignee: (params.assignee as any) || undefined,
    link: (params.link as any) || undefined,
    // By default, hide subtasks from the overview unless explicitly requested
    kind: (params.kind as any) || "root",
    // By default, hide archived todos from the overview
    archive: "unarchived",
    sort: params.sort,
  });

  // Check if user can create todos (ToDo module permission)
  // Todos are completely independent of projects
  const canCreateTasks = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "todos.create");

  return (
    <>
      {/* Auto-load last used task filters */}
      <TaskFilterLoader />
      <TasksPageClient
        tasks={tasks as any}
        canManage={canCreateTasks}
        userRole={user.role}
        userTimezone={user.timezone ?? "UTC"}
      />
    </>
  );
}
