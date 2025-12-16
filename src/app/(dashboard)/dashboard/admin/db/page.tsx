"use server";

import { requireAuth } from "@/lib/utils/auth-server";
import { hasPermission } from "@/lib/utils/permissions";
import { AdminDatabaseConsolePage } from "@/components/features/admin/AdminDatabaseConsole";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";

export default async function AdminDatabasePage() {
  const user = await requireAuth();

  const [canViewDb, canEditEntries, canDeleteEntries] = await Promise.all([
    hasPermission(user.id, "admin.db.view"),
    hasPermission(user.id, "admin.db.edit_entries"),
    hasPermission(user.id, "admin.db.delete_entries"),
  ]);

  if (!canViewDb) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">Access Denied</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You don&apos;t have permission to access the Database Explorer. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
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


