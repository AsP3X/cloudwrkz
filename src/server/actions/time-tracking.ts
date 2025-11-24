"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import { generateRandomTimerName, calculateElapsedTime } from "@/lib/utils/time-tracking";
import { timeTrackingEvents } from "@/lib/utils/event-emitter";
import { type TimeEntryStatus } from "@prisma/client";

/**
 * Emit a time tracking event
 */
function emitTimeTrackingEvent(userId: string, type: string, data: any) {
  timeTrackingEvents.emit("time-entry-update", {
    type,
    userId,
    data,
    timestamp: new Date().toISOString(),
  });
}

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type CreateTimeEntryInput = {
  name?: string; // Optional, will generate if not provided
  description?: string;
  tags?: string[];
  ticketId?: string; // Future
  billable?: boolean; // Future
};

export type UpdateTimeEntryInput = {
  name?: string;
  description?: string;
  tags?: string[];
  ticketId?: string | null;
  billable?: boolean;
};

export type TimeEntryFilters = {
  status?: TimeEntryStatus[];
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  ticketId?: string;
  sortBy?: "createdAt" | "startedAt" | "totalDuration";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type BulkUpdateInput = {
  status?: TimeEntryStatus;
  tags?: string[];
  ticketId?: string | null;
};

/**
 * Create a new time entry with RUNNING status
 */
export async function createTimeEntry(
  input: CreateTimeEntryInput
): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if time tracking module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    // Generate name if not provided
    const name = input.name?.trim() || generateRandomTimerName();

    // Validate ticketId if provided
    if (input.ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: input.ticketId },
        select: { id: true },
      });
      if (!ticket) {
        return {
          success: false,
          error: "Ticket not found",
          fieldErrors: { ticketId: ["Ticket does not exist"] },
        };
      }
    }

    const entry = await prisma.timeEntry.create({
      data: {
        name,
        description: input.description?.trim() || null,
        tags: input.tags || [],
        userId: user.id,
        ticketId: input.ticketId || null,
        billable: input.billable || false,
        status: "RUNNING",
        startedAt: new Date(),
        lastResumedAt: new Date(),
        totalDuration: 0,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_CREATED", entry);
    return {
      success: true,
      data: { id: entry.id },
      message: "Timer started successfully",
    };
  } catch (error: any) {
    console.error("Error creating time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to create time entry",
    };
  }
}

/**
 * Create a time entry with specific duration (for manual entries)
 */
export async function createTimeEntryWithDuration(
  input: CreateTimeEntryInput & { totalDuration: number; startedAt: Date; stoppedAt?: Date }
): Promise<ActionResult<{ id: string }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const name = input.name?.trim() || generateRandomTimerName();

    if (input.ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: input.ticketId },
        select: { id: true },
      });
      if (!ticket) {
        return {
          success: false,
          error: "Ticket not found",
          fieldErrors: { ticketId: ["Ticket does not exist"] },
        };
      }
    }

    const entry = await prisma.timeEntry.create({
      data: {
        name,
        description: input.description?.trim() || null,
        tags: input.tags || [],
        userId: user.id,
        ticketId: input.ticketId || null,
        billable: input.billable || false,
        status: "STOPPED",
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt || new Date(),
        totalDuration: input.totalDuration,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_CREATED", entry);
    return {
      success: true,
      data: { id: entry.id },
      message: "Time entry created successfully",
    };
  } catch (error: any) {
    console.error("Error creating time entry with duration:", error);
    return {
      success: false,
      error: error.message || "Failed to create time entry",
    };
  }
}

/**
 * Update time entry fields
 */
export async function updateTimeEntry(
  id: string,
  input: UpdateTimeEntryInput
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    // Verify ownership
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (existing.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Validate ticketId if provided
    if (input.ticketId !== undefined && input.ticketId !== null) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: input.ticketId },
        select: { id: true },
      });
      if (!ticket) {
        return {
          success: false,
          error: "Ticket not found",
          fieldErrors: { ticketId: ["Ticket does not exist"] },
        };
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim() || null,
        }),
        ...(input.tags !== undefined && { tags: input.tags }),
        ...(input.ticketId !== undefined && { ticketId: input.ticketId }),
        ...(input.billable !== undefined && { billable: input.billable }),
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_UPDATED", updated);
    return {
      success: true,
      message: "Time entry updated successfully",
    };
  } catch (error: any) {
    console.error("Error updating time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to update time entry",
    };
  }
}

/**
 * Pause a running timer
 */
export async function pauseTimeEntry(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        totalDuration: true,
        lastResumedAt: true,
        startedAt: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (entry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    if (entry.status !== "RUNNING") {
      return {
        success: false,
        error: "Only running timers can be paused",
      };
    }

    // Calculate elapsed time since last resume (or start)
    const now = new Date();
    const resumeTime = entry.lastResumedAt || entry.startedAt;
    const elapsedSeconds = Math.floor((now.getTime() - resumeTime.getTime()) / 1000);
    const newTotalDuration = entry.totalDuration + elapsedSeconds;

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "PAUSED",
        pausedAt: now,
        totalDuration: newTotalDuration,
        lastResumedAt: null,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_STATUS_CHANGED", { id, status: "PAUSED", entry: updated });
    return {
      success: true,
      message: "Timer paused successfully",
    };
  } catch (error: any) {
    console.error("Error pausing time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to pause timer",
    };
  }
}

/**
 * Resume a paused timer
 */
export async function resumeTimeEntry(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (entry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    if (entry.status !== "PAUSED") {
      return {
        success: false,
        error: "Only paused timers can be resumed",
      };
    }

    const now = new Date();

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "RUNNING",
        lastResumedAt: now,
        pausedAt: null,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_STATUS_CHANGED", { id, status: "RUNNING", entry: updated });
    return {
      success: true,
      message: "Timer resumed successfully",
    };
  } catch (error: any) {
    console.error("Error resuming time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to resume timer",
    };
  }
}

/**
 * Stop a running or paused timer
 */
export async function stopTimeEntry(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        totalDuration: true,
        lastResumedAt: true,
        startedAt: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (entry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    if (entry.status !== "RUNNING" && entry.status !== "PAUSED") {
      return {
        success: false,
        error: "Only running or paused timers can be stopped",
      };
    }

    const now = new Date();
    let finalDuration = entry.totalDuration;

    // If running, calculate final duration
    if (entry.status === "RUNNING") {
      const resumeTime = entry.lastResumedAt || entry.startedAt;
      const elapsedSeconds = Math.floor((now.getTime() - resumeTime.getTime()) / 1000);
      finalDuration = entry.totalDuration + elapsedSeconds;
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        totalDuration: finalDuration,
        lastResumedAt: null,
        pausedAt: null,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_STATUS_CHANGED", { id, status: "STOPPED", entry: updated });
    return {
      success: true,
      message: "Timer stopped successfully",
    };
  } catch (error: any) {
    console.error("Error stopping time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to stop timer",
    };
  }
}

/**
 * Mark entry as COMPLETED
 */
export async function completeTimeEntry(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        totalDuration: true,
        lastResumedAt: true,
        startedAt: true,
      },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (entry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const now = new Date();
    let finalDuration = entry.totalDuration;

    // If running, calculate final duration
    if (entry.status === "RUNNING") {
      const resumeTime = entry.lastResumedAt || entry.startedAt;
      const elapsedSeconds = Math.floor((now.getTime() - resumeTime.getTime()) / 1000);
      finalDuration = entry.totalDuration + elapsedSeconds;
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        totalDuration: finalDuration,
        lastResumedAt: null,
        pausedAt: entry.status === "PAUSED" ? entry.pausedAt : null,
        stoppedAt: entry.status === "STOPPED" ? entry.stoppedAt : now,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_STATUS_CHANGED", { id, status: "COMPLETED", entry: updated });
    return {
      success: true,
      message: "Time entry completed successfully",
    };
  } catch (error: any) {
    console.error("Error completing time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to complete time entry",
    };
  }
}

/**
 * Delete a time entry
 */
export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!entry) {
      return {
        success: false,
        error: "Time entry not found",
      };
    }

    if (entry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    await prisma.timeEntry.delete({
      where: { id },
    });

    revalidatePath("/dashboard/time-tracking");
    emitTimeTrackingEvent(user.id, "ENTRY_DELETED", { id });
    return {
      success: true,
      message: "Time entry deleted successfully",
    };
  } catch (error: any) {
    console.error("Error deleting time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to delete time entry",
    };
  }
}

/**
 * Get time entries with filters
 */
/**
 * Get a single time entry by ID
 */
export async function getTimeEntry(id: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return null;
    }

    const user = await requireAuth();

    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!entry) {
      return null;
    }

    // Verify ownership
    if (entry.userId !== user.id) {
      return null;
    }

    return entry;
  } catch (error: any) {
    console.error("Error fetching time entry:", error);
    return null;
  }
}

export async function getTimeEntries(filters: TimeEntryFilters = {}) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();

    const where: any = {
      userId: user.id,
    };

    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasEvery: filters.tags };
    }

    if (filters.ticketId) {
      where.ticketId = filters.ticketId;
    }

    const sortBy = filters.sortBy || "createdAt";
    const sortOrder = filters.sortOrder || "desc";
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: {
          ticket: {
            select: {
              id: true,
              ticketNumber: true,
              title: true,
            },
          },
        },
      }),
      prisma.timeEntry.count({ where }),
    ]);

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error: any) {
    console.error("Error fetching time entries:", error);
    return {
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    };
  }
}

/**
 * Get active (RUNNING and PAUSED) time entries for a user
 */
export async function getActiveTimeEntries(userId?: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return [];
    }

    const user = userId ? { id: userId } : await requireAuth();

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        status: {
          in: ["RUNNING", "PAUSED"],
        },
      },
      orderBy: { startedAt: "desc" },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
          },
        },
      },
    });

    // Calculate current elapsed time for each entry
    return entries.map((entry) => ({
      ...entry,
      currentDuration: calculateElapsedTime(entry),
    }));
  } catch (error: any) {
    console.error("Error fetching active time entries:", error);
    return [];
  }
}

/**
 * Bulk update time entries
 */
export async function bulkUpdateTimeEntries(
  ids: string[],
  updates: BulkUpdateInput
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    if (ids.length === 0) {
      return {
        success: false,
        error: "No entries selected",
      };
    }

    // Verify ownership of all entries
    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });

    const unauthorized = entries.filter((e) => e.userId !== user.id);
    if (unauthorized.length > 0) {
      return {
        success: false,
        error: "Unauthorized: Some entries do not belong to you",
      };
    }

    // Handle status changes with duration calculations
    if (updates.status) {
      const now = new Date();
      for (const id of ids) {
        const entry = await prisma.timeEntry.findUnique({
          where: { id },
          select: {
            status: true,
            totalDuration: true,
            lastResumedAt: true,
            startedAt: true,
          },
        });

        if (!entry) continue;

        let finalDuration = entry.totalDuration;

        // If changing from RUNNING to another status, calculate final duration
        if (entry.status === "RUNNING" && updates.status !== "RUNNING") {
          const resumeTime = entry.lastResumedAt || entry.startedAt;
          const elapsedSeconds = Math.floor((now.getTime() - resumeTime.getTime()) / 1000);
          finalDuration = entry.totalDuration + elapsedSeconds;
        }

        await prisma.timeEntry.update({
          where: { id },
          data: {
            status: updates.status,
            totalDuration: finalDuration,
            ...(updates.status === "STOPPED" && { stoppedAt: now }),
            ...(updates.status === "COMPLETED" && { completedAt: now }),
            ...(updates.status !== "RUNNING" && { lastResumedAt: null }),
            ...(updates.status === "RUNNING" && { lastResumedAt: now, pausedAt: null }),
          },
        });
      }
    } else {
      // Update other fields
      const updateData: any = {};
      if (updates.tags !== undefined) {
        updateData.tags = updates.tags;
      }
      if (updates.ticketId !== undefined) {
        updateData.ticketId = updates.ticketId;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.timeEntry.updateMany({
          where: { id: { in: ids } },
          data: updateData,
        });
      }
    }

    revalidatePath("/dashboard/time-tracking");
    // Emit events for all updated entries
    for (const id of ids) {
      emitTimeTrackingEvent(user.id, "ENTRY_UPDATED", { id });
    }
    return {
      success: true,
      message: `${ids.length} time entr${ids.length === 1 ? "y" : "ies"} updated successfully`,
    };
  } catch (error: any) {
    console.error("Error bulk updating time entries:", error);
    return {
      success: false,
      error: error.message || "Failed to update time entries",
    };
  }
}

/**
 * Get time entries for a specific ticket
 */
export async function getTimeEntriesForTicket(ticketId: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();

    const entries = await prisma.timeEntry.findMany({
      where: {
        ticketId,
        userId: user.id, // Only show user's own timers
      },
      orderBy: { createdAt: "desc" },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
          },
        },
      },
    });

    return entries;
  } catch (error: any) {
    console.error("Error fetching time entries for ticket:", error);
    return [];
  }
}

/**
 * Get count of timers for a specific ticket (all users)
 */
export async function getTimerCountForTicket(ticketId: string): Promise<number> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return 0;
    }

    const count = await prisma.timeEntry.count({
      where: {
        ticketId,
      },
    });

    return count;
  } catch (error: any) {
    console.error("Error counting timers for ticket:", error);
    return 0;
  }
}

/**
 * Get available time entries that can be assigned to a ticket (user's timers without a ticket)
 */
export async function getAvailableTimeEntriesForAssignment() {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        ticketId: null, // Only timers not assigned to any ticket
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Limit to recent 50
    });

    return entries;
  } catch (error: any) {
    console.error("Error fetching available time entries:", error);
    return [];
  }
}

/**
 * Bulk delete time entries
 */
export async function bulkDeleteTimeEntries(ids: string[]): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    if (ids.length === 0) {
      return {
        success: false,
        error: "No entries selected",
      };
    }

    // Verify ownership
    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });

    const unauthorized = entries.filter((e) => e.userId !== user.id);
    if (unauthorized.length > 0) {
      return {
        success: false,
        error: "Unauthorized: Some entries do not belong to you",
      };
    }

    await prisma.timeEntry.deleteMany({
      where: { id: { in: ids } },
    });

    revalidatePath("/dashboard/time-tracking");
    // Emit events for all deleted entries
    for (const id of ids) {
      emitTimeTrackingEvent(user.id, "ENTRY_DELETED", { id });
    }
    return {
      success: true,
      message: `${ids.length} time entr${ids.length === 1 ? "y" : "ies"} deleted successfully`,
    };
  } catch (error: any) {
    console.error("Error bulk deleting time entries:", error);
    return {
      success: false,
      error: error.message || "Failed to delete time entries",
    };
  }
}
