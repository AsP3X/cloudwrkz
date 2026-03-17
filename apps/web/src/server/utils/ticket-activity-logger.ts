"use server";

import { prisma } from "@/lib/db/prisma";

/**
 * Helper function to log ticket activity
 * This is a shared utility to avoid circular dependencies
 */
export async function logTicketActivity(
  ticketId: string,
  activityType:
    | "CREATED"
    | "STATUS_CHANGED"
    | "PRIORITY_CHANGED"
    | "TYPE_CHANGED"
    | "TITLE_CHANGED"
    | "DESCRIPTION_CHANGED"
    | "ASSIGNED_TO_AGENT"
    | "UNASSIGNED_FROM_AGENT"
    | "ASSIGNED_TO_GROUP"
    | "UNASSIGNED_FROM_GROUP"
    | "TAGS_CHANGED"
    | "RESOLVED"
    | "CLOSED"
    | "REOPENED"
    | "COMMENT_ADDED"
    | "TIMER_CREATED"
    | "TIMER_ASSIGNED"
    | "TIMER_UNASSIGNED"
    | "TIMER_STARTED"
    | "TIMER_PAUSED"
    | "TIMER_RESUMED"
    | "TIMER_STOPPED"
    | "MERGED_FROM_TICKET"
    | "MERGED_INTO_TICKET",
  changedById: string,
  changedByName: string | null,
  oldValue?: string | null,
  newValue?: string | null,
  metadata?: Record<string, any>
) {
  try {
    // Verify ticket exists before logging activity
    const ticketExists = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });

    if (!ticketExists) {
      console.error(`Failed to log ticket activity: Ticket ${ticketId} does not exist`);
      return;
    }

    await prisma.ticketActivity.create({
      data: {
        ticketId,
        // Cast to any to avoid tight coupling to generated enum type while
        // still allowing string-based activity types in callers.
        activityType: activityType as any,
        changedById,
        changedByName,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
        // For merge summary events, also set mergedFromTicketNumber for easier display
        mergedFromTicketNumber:
          activityType === "MERGED_FROM_TICKET"
            ? (metadata?.sourceTicketNumber ?? newValue ?? null)
            : null,
      },
    });
  } catch (error: any) {
    // Log detailed error but don't fail the operation
    console.error("Failed to log ticket activity:", {
      ticketId,
      activityType,
      changedById,
      error: error?.message || error,
      stack: error?.stack,
    });
  }
}
