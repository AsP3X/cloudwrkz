"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";

export type NotificationType =
  | "TICKET_ASSIGNED"
  | "TICKET_STATUS_CHANGED"
  | "TICKET_COMMENT_ADDED"
  | "TODO_ASSIGNED"
  | "UNBAN_REVIEWED";

export type NotificationEntry = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceUrl: string | null;
  read: boolean;
  createdAt: Date;
};

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Internal helper — creates a notification for a user.
 * Does NOT require auth (called from other server actions).
 * Silently ignores errors so it never breaks the calling action.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  resourceType?: string,
  resourceId?: string,
  resourceUrl?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body: body ?? null,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
        resourceUrl: resourceUrl ?? null,
      },
    });
  } catch {
    // Non-critical — never break the calling action
  }
}

/**
 * Get recent notifications for the current user.
 */
export async function getNotifications(limit = 20): Promise<ActionResult<{ notifications: NotificationEntry[]; unreadCount: number }>> {
  try {
    const user = await requireAuth();

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          resourceType: true,
          resourceId: true,
          resourceUrl: true,
          read: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({
        where: { userId: user.id, read: false },
      }),
    ]);

    return {
      success: true,
      data: {
        notifications: notifications as NotificationEntry[],
        unreadCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch notifications",
    };
  }
}

/**
 * Get the count of unread notifications for the current user.
 * Lightweight — used for polling.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const user = await requireAuth();
    return await prisma.notification.count({
      where: { userId: user.id, read: false },
    });
  } catch {
    return 0;
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    });
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark notification as read",
    };
  }
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark notifications as read",
    };
  }
}
