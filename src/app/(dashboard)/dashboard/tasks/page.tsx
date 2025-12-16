import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTasks } from "@/server/actions/tasks";
import { hasPermission } from "@/lib/utils/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TasksPageClient } from "./TasksPageClient";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TasksPage() {
  const user = await getCurrentUser();

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  const canViewTasks = await canUserViewModule(user.id, MODULE_KEYS.TASKS);

  if (!canViewTasks) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Tasks module. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Get all tasks
  const tasks = await getAllTasks();

  // Check if user can create tasks (tasks module permission)
  // Tasks are completely independent of projects
  const canCreateTasks = 
    user.role === "ADMIN" || 
    user.role === "AGENT" || 
    user.role === "MODERATOR" ||
    await hasPermission(user.id, "tasks.create");

  return (
    <TasksPageClient
      initialTasks={tasks as any}
      canManage={canCreateTasks}
      userRole={user.role}
    />
  );
}
