import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getAllSessionsAdmin } from "@/server/actions/admin/sessions";
import { SessionManagementPage } from "@/components/features/admin/SessionManagement/SessionManagementPage";

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const search = searchParams.search as string | undefined;
  const page = searchParams.page ? parseInt(searchParams.page as string) : 1;

  const result = await getAllSessionsAdmin({
    search,
    page,
    limit: 50,
  });

  return <SessionManagementPage initialData={result} />;
}
