import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getAllProjects } from "@/server/actions/projects";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";
import { ProjectManagementPage } from "@/components/features/admin/ProjectManagement/ProjectManagementPage";

export default async function AdminProjectsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  // Check if projects module is enabled
  const projectsEnabled = await isModuleEnabled(MODULE_KEYS.PROJECTS);

  const projects = projectsEnabled ? await getAllProjects() : [];

  return (
    <div className="relative">
      {/* Blur overlay when module is disabled */}
      {!projectsEnabled && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border-2 border-error-200 dark:border-error-800 p-8 max-w-md mx-4 text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 mx-auto text-error-500 dark:text-error-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              Projects Module Disabled
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              The projects module is not currently enabled. Please enable it in the Modules section to access project management.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href={ROUTES.ADMIN_MODULES}>
                <Button variant="primary">Go to Modules</Button>
              </Link>
              <Link href={ROUTES.DASHBOARD}>
                <Button variant="outline">Back to Dashboard</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
      
      {/* Page content - blurred when module is disabled */}
      <div className={projectsEnabled ? "" : "blur-sm pointer-events-none"}>
        <ProjectManagementPage initialProjects={projects} />
      </div>
    </div>
  );
}
