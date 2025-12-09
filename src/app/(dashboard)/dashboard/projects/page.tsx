import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { getAllProjects } from "@/server/actions/projects";
import { canUserViewModule } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { ProjectsPage } from "@/components/features/projects/ProjectsPage";

interface ProjectsPageProps {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    createdFrom?: string;
    createdTo?: string;
    updatedFrom?: string;
    updatedTo?: string;
    sort?: string;
  }>;
}

export default async function UserProjectsPage({ searchParams }: ProjectsPageProps) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  // Check if user can view projects module (module enabled AND user has permission)
  const canViewProjects = await canUserViewModule(user.id, MODULE_KEYS.PROJECTS);
  
  if (!canViewProjects) {
    redirect("/dashboard");
  }

  // Get projects the user has access to (as member, manager, or via groups)
  const projects = await getAllProjects();
  const params = await searchParams;

  return <ProjectsPage initialProjects={projects} searchParams={params} />;
}
