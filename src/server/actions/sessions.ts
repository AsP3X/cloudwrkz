"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/server/actions/admin/sessions";

export type MySession = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
};

export async function getMySessions(): Promise<ActionResult<{ sessions: MySession[] }>> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get("session")?.value || null;

    const sessions = await prisma.session.findMany({
      where: {
        userId: user.id,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        token: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });

    const mapped: MySession[] = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      isCurrent: currentToken != null && session.token === currentToken,
    }));

    return {
      success: true,
      data: {
        sessions: mapped,
      },
    };
  } catch (error: any) {
    console.error("getMySessions error:", error);
    return {
      success: false,
      error: error.message || "Failed to load sessions",
    };
  }
}

export async function revokeMySession(sessionId: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get("session")?.value || null;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, token: true },
    });

    if (!session || session.userId !== user.id) {
      return {
        success: false,
        error: "Session not found",
      };
    }

    await prisma.session.delete({
      where: { id: sessionId },
    });

    // If this was the current device, clear cookie as well
    if (currentToken && session.token === currentToken) {
      cookieStore.delete("session");
      revalidatePath("/");
      revalidatePath("/dashboard");
      revalidatePath("/login");
    }

    return {
      success: true,
      message: "Session revoked successfully",
    };
  } catch (error: any) {
    console.error("revokeMySession error:", error);
    return {
      success: false,
      error: error.message || "Failed to revoke session",
    };
  }
}

export async function revokeAllMyOtherSessions(): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get("session")?.value || null;

    const where: { userId: string; token?: { not: string } } = {
      userId: user.id,
    };

    if (currentToken) {
      where.token = { not: currentToken };
    }

    await prisma.session.deleteMany({
      where,
    });

    return {
      success: true,
      message: "Other sessions revoked successfully",
    };
  } catch (error: any) {
    console.error("revokeAllMyOtherSessions error:", error);
    return {
      success: false,
      error: error.message || "Failed to revoke other sessions",
    };
  }
}

export async function revokeAllMySessions(): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();

    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    cookieStore.delete("session");

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/login");

    return {
      success: true,
      message: "All sessions revoked successfully",
    };
  } catch (error: any) {
    console.error("revokeAllMySessions error:", error);
    return {
      success: false,
      error: error.message || "Failed to revoke sessions",
    };
  }
}

