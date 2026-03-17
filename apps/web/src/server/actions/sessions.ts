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
  deviceId?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  deviceOs?: string | null;
  deviceBrowser?: string | null;
  ipAddress?: string | null;
};

export async function getMySessions(): Promise<ActionResult<{ sessions: MySession[] }>> {
  try {
    const user = await requireAuth();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get("session")?.value || null;

    const sessions = await prisma.session.findMany({
      where: {
        userId: user.id,
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
        deviceId: true,
        deviceName: true,
        deviceType: true,
        deviceOs: true,
        deviceBrowser: true,
        ipAddress: true,
      },
    });

    const mapped: MySession[] = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      isCurrent: currentToken != null && session.token === currentToken,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      deviceType: session.deviceType,
      deviceOs: session.deviceOs,
      deviceBrowser: session.deviceBrowser,
      ipAddress: session.ipAddress,
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

// ─── Recently Viewed ──────────────────────────────────────────────────────────

export type RecentlyViewedEntry = {
  type: "ticket" | "todo" | "link" | "timeEntry";
  id: string;
  title: string;
  url: string;
  viewedAt: string; // ISO string
};

const MAX_RECENTLY_VIEWED = 10;

/**
 * Record a page visit in the current session's recentlyViewed list.
 * Silently does nothing if no session cookie is present or DB is unavailable.
 */
export async function recordRecentView(entry: Omit<RecentlyViewedEntry, "viewedAt">): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return;

    const session = await prisma.session.findUnique({
      where: { token },
      select: { id: true, recentlyViewed: true },
    });
    if (!session) return;

    const existing: RecentlyViewedEntry[] = Array.isArray(session.recentlyViewed)
      ? (session.recentlyViewed as RecentlyViewedEntry[])
      : [];

    // Prepend new entry, dedupe by id+type, trim to max
    const newEntry: RecentlyViewedEntry = { ...entry, viewedAt: new Date().toISOString() };
    const deduped = [
      newEntry,
      ...existing.filter((e) => !(e.id === entry.id && e.type === entry.type)),
    ].slice(0, MAX_RECENTLY_VIEWED);

    await prisma.session.update({
      where: { id: session.id },
      data: { recentlyViewed: deduped },
    });
  } catch {
    // Non-critical — never break page rendering
  }
}

/**
 * Read the recentlyViewed list from the current session.
 * Returns an empty array if unavailable.
 */
export async function getRecentlyViewed(): Promise<RecentlyViewedEntry[]> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return [];

    const session = await prisma.session.findUnique({
      where: { token },
      select: { recentlyViewed: true },
    });
    if (!session?.recentlyViewed) return [];

    return Array.isArray(session.recentlyViewed)
      ? (session.recentlyViewed as RecentlyViewedEntry[])
      : [];
  } catch {
    return [];
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

