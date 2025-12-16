"use server";

import { requireAuth, requireRole } from "@/lib/utils/auth-server";
import { AdminDatabaseConsolePage } from "@/components/features/admin/AdminDatabaseConsole";

export default async function AdminDatabasePage() {
  const user = await requireAuth();
  await requireRole("ADMIN");

  return <AdminDatabaseConsolePage user={user} />;
}

