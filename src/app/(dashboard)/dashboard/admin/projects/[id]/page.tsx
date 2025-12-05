import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getProject } from "@/server/actions/projects";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { ProjectDetailPage } from "@/components/features/admin/ProjectManagement/ProjectDetailPage";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  // Check if projects module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  
  if (!projectsEnabled) {
    redirect("/dashboard/admin/projects");
  }

  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    redirect("/dashboard/admin/projects");
  }

  return <ProjectDetailPage project={project} />;
}
