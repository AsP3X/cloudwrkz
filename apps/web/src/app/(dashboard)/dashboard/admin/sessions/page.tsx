import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requirePermissionOrRedirect } from "@/lib/utils/auth-server";
import { getAllSessionsAdmin } from "@/server/actions/admin/sessions";
import { SessionManagementPage } from "@/components/features/admin/SessionManagement/SessionManagementPage";

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");
  await requirePermissionOrRedirect("admin.sessions.view");

  const params = await searchParams;
  const search = params.search as string | undefined;
  const page = params.page ? parseInt(params.page as string) : 1;

  const result = await getAllSessionsAdmin({
    search,
    page,
    limit: 50,
  });

  return <SessionManagementPage initialData={result} />;
}
