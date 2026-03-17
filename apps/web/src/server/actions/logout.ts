"use server";

import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/server/utils/audit-log";

export async function logout() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;

    if (sessionToken) {
      const session = await prisma.session.findUnique({
        where: { token: sessionToken },
        select: { id: true, userId: true },
      });
      await prisma.session.deleteMany({
        where: { token: sessionToken },
      });
      if (session?.userId) {
        const headerStore = await headers();
        const ipAddress =
          headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          headerStore.get("x-real-ip") ||
          null;
        const userAgent = headerStore.get("user-agent") || null;
        auditLog({
          action: "auth.logout",
          userId: session.userId,
          resourceType: "session",
          resourceId: session.id,
          context: {},
          ipAddress,
          userAgent,
        });
      }
    }

    cookieStore.delete("session");

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/login");

    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, error: "Failed to logout" };
  }
}
