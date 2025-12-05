import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { getAllProjects } from "@/server/actions/projects";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { ProjectsPage } from "@/components/features/projects/ProjectsPage";

export default async function UserProjectsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  // Check if projects module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);
  
  if (!projectsEnabled) {
    redirect("/dashboard");
  }

  // Get projects the user has access to (as member, manager, or via groups)
  const projects = await getAllProjects();

  return <ProjectsPage initialProjects={projects} />;
}
