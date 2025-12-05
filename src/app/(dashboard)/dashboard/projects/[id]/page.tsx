import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { getProject, getProjectTickets, getProjectTimeAllocation } from "@/server/actions/projects";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { ProjectDetailPage } from "@/components/features/projects/ProjectDetailPage";

export default async function UserProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  // Check if projects module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  
  if (!projectsEnabled) {
    redirect("/dashboard/projects");
  }

  const { id } = await params;
  const project = await getProject(id);

  // getProject already checks permissions, so if it returns null, user doesn't have access
  if (!project) {
    redirect("/dashboard/projects");
  }

  // Fetch tickets and time allocation for members
  const [tickets, timeAllocation] = await Promise.all([
    getProjectTickets(id),
    getProjectTimeAllocation(id),
  ]);

  return <ProjectDetailPage project={project} initialTickets={tickets} initialTimeAllocation={timeAllocation} />;
}
