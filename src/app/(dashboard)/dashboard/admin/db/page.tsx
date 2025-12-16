"use server";

import { requireAuth, requireRole } from "@/lib/utils/auth-server";
import { AdminDatabaseConsolePage } from "@/components/features/admin/AdminDatabaseConsole";
import { prisma } from "@/lib/db/prisma";

export default async function AdminDatabasePage() {
  const user = await requireAuth();
  await requireRole("ADMIN");

  // Fetch list of tables from the public schema to show in the overview.
  // This is a simple introspection query and is kept read-only.
  const tablesRaw = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );

  const tables = Array.isArray(tablesRaw)
    ? tablesRaw.map((t) => t.table_name).filter(Boolean)
    : [];

  return <AdminDatabaseConsolePage user={user} tables={tables} />;
}


