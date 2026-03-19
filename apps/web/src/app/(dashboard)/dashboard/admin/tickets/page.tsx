import { redirect } from "next/navigation";
import { getCurrentUser, requireAnyPermissionOrRedirect } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getAllTicketsAdmin } from "@/server/actions/admin/tickets";
import { TicketManagementPage } from "@/components/features/admin/TicketManagement/TicketManagementPage";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { ROUTES } from "@/lib/constants/routes";

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  const [,, ticketsEnabled] = await Promise.all([
    requireRole("ADMIN"),
    requireAnyPermissionOrRedirect(ROUTES.DASHBOARD, "tickets.view_all", "admin.tickets.manage"),
    isModuleEnabled(MODULE_KEYS.TICKETS),
  ]);

  const params = await searchParams;
  const status = params.status as string | undefined;
  const priority = params.priority as string | undefined;
  const type = params.type as string | undefined;
  const assignedToId = params.assignedToId as string | undefined;
  const createdById = params.createdById as string | undefined;
  const search = params.search as string | undefined;
  const page = params.page ? parseInt(params.page as string) : 1;

  const result = await getAllTicketsAdmin({
    status,
    priority,
    type,
    assignedToId,
    createdById,
    search,
    page,
    limit: 50,
  });

  return (
    <div className="relative">
      {/* Blur overlay when module is disabled */}
      {!ticketsEnabled && (
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
              Tickets Module Disabled
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 mb-6">
              The tickets module is not currently enabled. Please enable it in the Modules section to access ticket management.
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
      <div className={ticketsEnabled ? "" : "blur-sm pointer-events-none"}>
        <TicketManagementPage initialData={result} />
      </div>
    </div>
  );
}
