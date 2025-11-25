"use server";

import { prisma } from "@/lib/db/prisma";

/**
 * Helper function to log ticket activity
 * This is a shared utility to avoid circular dependencies
 */
export async function logTicketActivity(
  ticketId: string,
  activityType: "CREATED" | "STATUS_CHANGED" | "PRIORITY_CHANGED" | "TYPE_CHANGED" | "TITLE_CHANGED" | "DESCRIPTION_CHANGED" | "ASSIGNED_TO_AGENT" | "UNASSIGNED_FROM_AGENT" | "ASSIGNED_TO_GROUP" | "UNASSIGNED_FROM_GROUP" | "TAGS_CHANGED" | "RESOLVED" | "CLOSED" | "REOPENED" | "COMMENT_ADDED" | "TIMER_CREATED" | "TIMER_ASSIGNED" | "TIMER_UNASSIGNED" | "TIMER_STARTED" | "TIMER_PAUSED" | "TIMER_RESUMED" | "TIMER_STOPPED",
  changedById: string,
  changedByName: string | null,
  oldValue?: string | null,
  newValue?: string | null,
  metadata?: Record<string, any>
) {
  try {
    await prisma.ticketActivity.create({
      data: {
        ticketId,
        activityType,
        changedById,
        changedByName,
        oldValue: oldValue || null,
        newValue: newValue || null,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    // Log error but don't fail the operation
    console.error("Failed to log ticket activity:", error);
  }
}
