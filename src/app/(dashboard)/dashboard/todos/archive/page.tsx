import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getAllTodos } from "@/server/actions/todos";
import { hasPermission } from "@/lib/utils/permissions";
import { ArchivePageClient } from "./ArchivePageClient";

// Force dynamic rendering to keep permissions in sync
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TodosArchivePageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignee?: string;
    link?: string;
    kind?: string;
    sort?: string;
  }>;
}

export default async function TodosArchivePage({ searchParams }: TodosArchivePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || (user.role !== "USER" && user.role !== "AGENT" && user.role !== "ADMIN" && user.role !== "MODERATOR")) {
    redirect(ROUTES.LOGIN);
  }

  const canViewTodos = await canUserViewModule(user.id, MODULE_KEYS.TODOS);
  if (!canViewTodos) {
    redirect(ROUTES.DASHBOARD);
  }

  const tasks = await getAllTodos({
    status: params.status,
    priority: params.priority,
    assignee: (params.assignee as any) || undefined,
    link: (params.link as any) || undefined,
    kind: (params.kind as any) || "root",
    archive: "archived",
    sort: params.sort,
  });

  const canManage =
    user.role === "ADMIN" ||
    user.role === "AGENT" ||
    user.role === "MODERATOR" ||
    (await hasPermission(user.id, "todos.update")) ||
    (await hasPermission(user.id, "todos.delete"));

  return (
    <ArchivePageClient
      tasks={tasks as any}
      canManage={canManage}
      userTimezone={user.timezone ?? "UTC"}
    />
  );
}

