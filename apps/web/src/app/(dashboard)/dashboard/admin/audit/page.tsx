import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requirePermissionOrRedirect } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import {
  getAuditLogEntries,
  getAuditLogActionOptions,
} from "@/server/actions/admin/audit";
import { AuditLogPageClient } from "./AuditLogPageClient";

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");
  await requirePermissionOrRedirect("audit.view");

  const params = await searchParams;
  const page = params.page ? parseInt(params.page as string, 10) : 1;
  const rawLimit = params.limit as string | undefined;
  const limit = rawLimit && PAGE_SIZES.includes(Number(rawLimit) as (typeof PAGE_SIZES)[number])
    ? Number(rawLimit)
    : DEFAULT_PAGE_SIZE;
  const action = (params.action as string) || undefined;
  const userSearch = (params.search as string) || undefined;
  const resourceType = (params.resourceType as string) || undefined;
  const from = (params.from as string) || undefined;
  const to = (params.to as string) || undefined;
  const sortOrder = (params.sortOrder as string) === "asc" ? "asc" : "desc";

  const [result, actionOptions, canExport] = await Promise.all([
    getAuditLogEntries({
      page,
      limit,
      action,
      userSearch,
      resourceType,
      from,
      to,
      sortOrder,
    }),
    getAuditLogActionOptions(),
    hasPermission(user.id, "audit.export"),
  ]);

  return (
    <AuditLogPageClient
      initialData={result}
      actionOptions={actionOptions}
      canExport={canExport}
    />
  );
}
