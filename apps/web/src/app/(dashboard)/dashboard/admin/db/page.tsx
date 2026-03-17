import { requireAuth, requireRole } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { AdminDatabaseConsolePage } from "@/components/features/admin/AdminDatabaseConsole";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { AccessDeniedWarning } from "@/components/ui/AccessDeniedWarning";

export default async function AdminDatabasePage() {
  const user = await requireAuth();
  await requireRole("ADMIN");

  const [canViewDb, canEditEntries, canDeleteEntries] = await Promise.all([
    hasPermission(user.id, "admin.db.view"),
    hasPermission(user.id, "admin.db.edit_entries"),
    hasPermission(user.id, "admin.db.delete_entries"),
  ]);

  if (!canViewDb) {
    return (
      <AccessDeniedWarning
        message={
          <>
            You don&apos;t have permission to access the Database Explorer. Please contact an
            administrator.
          </>
        }
        primaryHref={ROUTES.DASHBOARD}
        primaryLabel="Back to Dashboard"
      />
    );
  }

  // Fetch list of tables from the public schema to show in the overview.
  // This is a simple introspection query and is kept read-only.
  const tablesRaw = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );

  const tables = Array.isArray(tablesRaw)
    ? tablesRaw.map((t) => t.table_name).filter(Boolean)
    : [];

  return (
    <AdminDatabaseConsolePage
      user={user}
      tables={tables}
      canEditEntries={canEditEntries}
      canDeleteEntries={canDeleteEntries}
    />
  );
}


