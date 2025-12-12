"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import { generateRandomTimerName, calculateElapsedTime, generateTimerNumber, parseTimerNumber } from "@/lib/utils/time-tracking";
import { timeTrackingEvents } from "@/lib/utils/event-emitter";
import { type TimeEntryStatus } from "@prisma/client";
import { logTicketActivity } from "../utils/ticket-activity-logger";

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
  location?: string;
};

export type UpdateTimeEntryInput = {
  name?: string;
  description?: string;
  tags?: string[];
  ticketId?: string | null;
  billable?: boolean;
  location?: string | null;
  stoppedAt?: Date;
  startedAt?: Date;
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

    // Check permission if creating from a ticket
    if (input.ticketId) {
      try {
        await requireAnyPermission("tickets.time_entries.create", "time_tracking.create");
      } catch {
        // Fallback to role check for backward compatibility
        if (!["ADMIN", "MODERATOR", "AGENT"].includes(user.role)) {
          return {
            success: false,
            error: "You don't have permission to create time entries for tickets",
          };
        }
      }
    } else {
      // For non-ticket time entries, check general time tracking permission
      try {
        await requireAnyPermission("time_tracking.create");
      } catch {
        // Fallback to role check for backward compatibility
        if (!["ADMIN", "MODERATOR", "AGENT", "USER"].includes(user.role)) {
          return {
            success: false,
            error: "You don't have permission to create time entries",
          };
        }
      }
    }

    // Generate name if not provided
    let name = input.name?.trim();
    if (!name) {
      // Find the highest sequence number for TMR- prefix
      const existingTimers = await prisma.timeEntry.findMany({
        where: {
          name: {
            startsWith: "TMR-",
          },
        },
        select: {
          name: true,
        },
        orderBy: {
          name: "desc",
        },
        take: 1,
      });

      let nextSequence = 1;
      if (existingTimers.length > 0) {
        const parsed = parseTimerNumber(existingTimers[0].name);
        if (parsed) {
          nextSequence = parsed.sequence + 1;
        }
      }

      name = generateTimerNumber(nextSequence);
    }

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
        location: input.location?.trim() || null,
        status: "RUNNING",
        startedAt: new Date(),
        lastResumedAt: new Date(),
        totalDuration: 0,
      },
    });

    // Log activity if timer is linked to a ticket
    if (input.ticketId) {
      try {
        await logTicketActivity(
          input.ticketId,
          "TIMER_CREATED",
          user.id,
          user.name || null,
          null,
          name,
          { timerId: entry.id }
        );
        // Revalidate ticket detail page to show the new activity
        revalidatePath(`/dashboard/tickets/${input.ticketId}`);
      } catch (error) {
        // Log error but don't fail the timer creation
        console.error("Failed to log timer creation activity:", error);
      }
    }

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

    // Generate name if not provided
    let name = input.name?.trim();
    if (!name) {
      // Find the highest sequence number for TMR- prefix
      const existingTimers = await prisma.timeEntry.findMany({
        where: {
          name: {
            startsWith: "TMR-",
          },
        },
        select: {
          name: true,
        },
        orderBy: {
          name: "desc",
        },
        take: 1,
      });

      let nextSequence = 1;
      if (existingTimers.length > 0) {
        const parsed = parseTimerNumber(existingTimers[0].name);
        if (parsed) {
          nextSequence = parsed.sequence + 1;
        }
      }

      name = generateTimerNumber(nextSequence);
    }

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
        location: input.location?.trim() || null,
        status: "STOPPED",
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt || new Date(),
        totalDuration: input.totalDuration,
      },
    });

    // Log activity if timer is linked to a ticket
    if (input.ticketId) {
      try {
        await logTicketActivity(
          input.ticketId,
          "TIMER_CREATED",
          user.id,
          user.name || null,
          null,
          name,
          { timerId: entry.id }
        );
        // Revalidate ticket detail page to show the new activity
        revalidatePath(`/dashboard/tickets/${input.ticketId}`);
      } catch (error) {
        // Log error but don't fail the timer creation
        console.error("Failed to log timer creation activity:", error);
      }
    }

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

    // Verify ownership and get current entry data for duration calculation
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      select: { 
        userId: true, 
        ticketId: true, 
        name: true, 
        startedAt: true,
        stoppedAt: true,
        status: true,
      },
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

    // Determine final startedAt and stoppedAt values
    const finalStartedAt = input.startedAt !== undefined ? input.startedAt : existing.startedAt;
    const finalStoppedAt = input.stoppedAt !== undefined ? input.stoppedAt : existing.stoppedAt;

    // Calculate duration if both start and end times are present and times are being updated
    let calculatedDuration: number | undefined;
    const isTimeUpdated = input.startedAt !== undefined || input.stoppedAt !== undefined;
    
    if (isTimeUpdated && finalStoppedAt) {
      // Calculate duration in seconds from the difference between stoppedAt and startedAt
      const durationSeconds = Math.floor(
        (finalStoppedAt.getTime() - finalStartedAt.getTime()) / 1000
      );
      
      // Only update if duration is non-negative
      if (durationSeconds >= 0) {
        calculatedDuration = durationSeconds;
      }
    }

    const updateData: any = {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description.trim() || null,
      }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.ticketId !== undefined && { ticketId: input.ticketId }),
      ...(input.billable !== undefined && { billable: input.billable }),
      ...(input.location !== undefined && {
        location: input.location?.trim() || null,
      }),
      ...(input.startedAt !== undefined && { startedAt: input.startedAt }),
      ...(input.stoppedAt !== undefined && { stoppedAt: input.stoppedAt }),
      ...(calculatedDuration !== undefined && { totalDuration: calculatedDuration }),
    };

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: updateData,
    });

    // Log activity if ticket assignment changed
    if (input.ticketId !== undefined) {
      const oldTicketId = existing.ticketId;
      const newTicketId = input.ticketId;

      if (oldTicketId !== newTicketId) {
        try {
          if (newTicketId && !oldTicketId) {
            // Timer assigned to ticket
            await logTicketActivity(
              newTicketId,
              "TIMER_ASSIGNED",
              user.id,
              user.name || null,
              null,
              existing.name,
              { timerId: id }
            );
            revalidatePath(`/dashboard/tickets/${newTicketId}`);
          } else if (!newTicketId && oldTicketId) {
            // Timer unassigned from ticket
            await logTicketActivity(
              oldTicketId,
              "TIMER_UNASSIGNED",
              user.id,
              user.name || null,
              existing.name,
              null,
              { timerId: id }
            );
            revalidatePath(`/dashboard/tickets/${oldTicketId}`);
          } else if (newTicketId && oldTicketId) {
            // Timer reassigned to different ticket
            await logTicketActivity(
              oldTicketId,
              "TIMER_UNASSIGNED",
              user.id,
              user.name || null,
              existing.name,
              null,
              { timerId: id }
            );
            await logTicketActivity(
              newTicketId,
              "TIMER_ASSIGNED",
              user.id,
              user.name || null,
              null,
              existing.name,
              { timerId: id }
            );
            revalidatePath(`/dashboard/tickets/${oldTicketId}`);
            revalidatePath(`/dashboard/tickets/${newTicketId}`);
          }
        } catch (error) {
          console.error("Failed to log timer assignment activity:", error);
        }
      }
    }

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
        ticketId: true,
        name: true,
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

    // Log activity if timer is linked to a ticket
    if (entry.ticketId) {
      try {
        await logTicketActivity(
          entry.ticketId,
          "TIMER_PAUSED",
          user.id,
          user.name || null,
          "RUNNING",
          "PAUSED",
          { timerId: id, timerName: entry.name }
        );
        revalidatePath(`/dashboard/tickets/${entry.ticketId}`);
      } catch (error) {
        console.error("Failed to log timer pause activity:", error);
      }
    }

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
      select: { userId: true, status: true, ticketId: true, name: true },
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

    // Log activity if timer is linked to a ticket
    if (entry.ticketId) {
      try {
        await logTicketActivity(
          entry.ticketId,
          "TIMER_RESUMED",
          user.id,
          user.name || null,
          "PAUSED",
          "RUNNING",
          { timerId: id, timerName: entry.name }
        );
        revalidatePath(`/dashboard/tickets/${entry.ticketId}`);
      } catch (error) {
        console.error("Failed to log timer resume activity:", error);
      }
    }

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
        ticketId: true,
        name: true,
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

    // Log activity if timer is linked to a ticket
    if (entry.ticketId) {
      try {
        await logTicketActivity(
          entry.ticketId,
          "TIMER_STOPPED",
          user.id,
          user.name || null,
          entry.status,
          "STOPPED",
          { timerId: id, timerName: entry.name, totalDuration: finalDuration }
        );
        revalidatePath(`/dashboard/tickets/${entry.ticketId}`);
      } catch (error) {
        console.error("Failed to log timer stop activity:", error);
      }
    }

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
      pausedAt: true,
      stoppedAt: true,
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
        breaks: {
          orderBy: { startedAt: "asc" },
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
      return {
        entries: [],
        total: 0,
        page: filters.page || 1,
        limit: filters.limit || 50,
        totalPages: 0,
      };
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
          breaks: {
            orderBy: { startedAt: "asc" },
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
        breaks: {
          orderBy: { startedAt: "asc" },
        },
      },
    });

    // Calculate current elapsed time for each entry
    return entries.map((entry) => {
      // Fetch breaks for each entry
      const breaks = entry.breaks || [];
      return {
        ...entry,
        breaks,
        currentDuration: calculateElapsedTime({ ...entry, breaks }),
      };
    });
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

    // Verify ownership of all entries and get current ticketIds for logging
    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, ticketId: true, name: true },
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
        
        // Log activity for each entry that has ticket assignment changed
        const ticketsToRevalidate = new Set<string>();
        for (const entry of entries) {
          const oldTicketId = entry.ticketId;
          const newTicketId = updates.ticketId;

          if (oldTicketId !== newTicketId) {
            try {
              if (newTicketId && !oldTicketId) {
                // Timer assigned to ticket
                await logTicketActivity(
                  newTicketId,
                  "TIMER_ASSIGNED",
                  user.id,
                  user.name || null,
                  null,
                  entry.name,
                  { timerId: entry.id }
                );
                ticketsToRevalidate.add(newTicketId);
              } else if (!newTicketId && oldTicketId) {
                // Timer unassigned from ticket
                await logTicketActivity(
                  oldTicketId,
                  "TIMER_UNASSIGNED",
                  user.id,
                  user.name || null,
                  entry.name,
                  null,
                  { timerId: entry.id }
                );
                ticketsToRevalidate.add(oldTicketId);
              } else if (newTicketId && oldTicketId) {
                // Timer reassigned to different ticket
                await logTicketActivity(
                  oldTicketId,
                  "TIMER_UNASSIGNED",
                  user.id,
                  user.name || null,
                  entry.name,
                  null,
                  { timerId: entry.id }
                );
                await logTicketActivity(
                  newTicketId,
                  "TIMER_ASSIGNED",
                  user.id,
                  user.name || null,
                  null,
                  entry.name,
                  { timerId: entry.id }
                );
                ticketsToRevalidate.add(oldTicketId);
                ticketsToRevalidate.add(newTicketId);
              }
            } catch (error) {
              console.error("Failed to log timer assignment activity:", error);
            }
          }
        }
        // Revalidate all affected ticket pages
        for (const ticketId of ticketsToRevalidate) {
          revalidatePath(`/dashboard/tickets/${ticketId}`);
        }
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

    // Get ticket to check dynamic permissions
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, type: true },
    });

    if (!ticket) {
      return [];
    }

    // Check permission to view ticket time entries (including dynamic permissions)
    if (user.role !== "ADMIN") {
      const { hasTicketPermission } = await import("@/lib/utils/permissions");
      const { getTicketTypePrefix } = await import("@/lib/utils/tickets");
      const ticketPrefix = getTicketTypePrefix(ticket.type);
      
      const hasDynamicPermission = await hasTicketPermission(
        user.id,
        ticket.id,
        ticketPrefix,
        "time_entries.view"
      );
      
      if (!hasDynamicPermission) {
        // Check general permissions
        try {
          await requireAnyPermission("tickets.time_entries.view", "time_tracking.view", "time_tracking.view_all");
        } catch {
          // Fallback to role check for backward compatibility
          if (!["ADMIN", "MODERATOR", "AGENT", "USER"].includes(user.role)) {
            return [];
          }
        }
      }
    }

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
        breaks: {
          orderBy: { startedAt: "asc" },
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

/**
 * Add a break to a time entry
 */
export async function addBreakToTimeEntry(
  timeEntryId: string,
  input: { startedAt?: Date; endedAt?: Date; description?: string }
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

    // Verify ownership
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
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

    const now = new Date();
    const breakStartedAt = input.startedAt || now;
    const breakEndedAt = input.endedAt || null;

    // Calculate duration if break has ended
    let duration = 0;
    if (breakEndedAt) {
      duration = Math.floor((breakEndedAt.getTime() - breakStartedAt.getTime()) / 1000);
      if (duration < 0) {
        return {
          success: false,
          error: "Break end time must be after start time",
        };
      }
    }

    const breakRecord = await prisma.timeEntryBreak.create({
      data: {
        timeEntryId,
        startedAt: breakStartedAt,
        endedAt: breakEndedAt,
        duration,
        description: input.description?.trim() || null,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    revalidatePath(`/dashboard/time-tracking/${timeEntryId}`);
    emitTimeTrackingEvent(user.id, "BREAK_ADDED", { timeEntryId, breakId: breakRecord.id });
    
    return {
      success: true,
      data: { id: breakRecord.id },
      message: "Break added successfully",
    };
  } catch (error: any) {
    console.error("Error adding break to time entry:", error);
    return {
      success: false,
      error: error.message || "Failed to add break",
    };
  }
}

/**
 * Update a break
 */
export async function updateBreak(
  breakId: string,
  input: { startedAt?: Date; endedAt?: Date | null; description?: string }
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

    // Get break with time entry to verify ownership
    const breakRecord = await prisma.timeEntryBreak.findUnique({
      where: { id: breakId },
      include: {
        timeEntry: {
          select: { userId: true },
        },
      },
    });

    if (!breakRecord) {
      return {
        success: false,
        error: "Break not found",
      };
    }

    if (breakRecord.timeEntry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const finalStartedAt = input.startedAt !== undefined ? input.startedAt : breakRecord.startedAt;
    const finalEndedAt = input.endedAt !== undefined ? input.endedAt : breakRecord.endedAt;

    // Calculate duration
    let duration = 0;
    if (finalEndedAt) {
      duration = Math.floor((finalEndedAt.getTime() - finalStartedAt.getTime()) / 1000);
      if (duration < 0) {
        return {
          success: false,
          error: "Break end time must be after start time",
        };
      }
    }

    await prisma.timeEntryBreak.update({
      where: { id: breakId },
      data: {
        ...(input.startedAt !== undefined && { startedAt: input.startedAt }),
        ...(input.endedAt !== undefined && { endedAt: input.endedAt }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
        duration,
      },
    });

    revalidatePath("/dashboard/time-tracking");
    revalidatePath(`/dashboard/time-tracking/${breakRecord.timeEntryId}`);
    emitTimeTrackingEvent(user.id, "BREAK_UPDATED", { timeEntryId: breakRecord.timeEntryId, breakId });
    
    return {
      success: true,
      message: "Break updated successfully",
    };
  } catch (error: any) {
    console.error("Error updating break:", error);
    return {
      success: false,
      error: error.message || "Failed to update break",
    };
  }
}

/**
 * Delete a break
 */
export async function deleteBreak(breakId: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Time tracking module is not enabled",
      };
    }

    const user = await requireAuth();

    // Get break with time entry to verify ownership
    const breakRecord = await prisma.timeEntryBreak.findUnique({
      where: { id: breakId },
      include: {
        timeEntry: {
          select: { userId: true },
        },
      },
    });

    if (!breakRecord) {
      return {
        success: false,
        error: "Break not found",
      };
    }

    if (breakRecord.timeEntry.userId !== user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const timeEntryId = breakRecord.timeEntryId;

    await prisma.timeEntryBreak.delete({
      where: { id: breakId },
    });

    revalidatePath("/dashboard/time-tracking");
    revalidatePath(`/dashboard/time-tracking/${timeEntryId}`);
    emitTimeTrackingEvent(user.id, "BREAK_DELETED", { timeEntryId, breakId });
    
    return {
      success: true,
      message: "Break deleted successfully",
    };
  } catch (error: any) {
    console.error("Error deleting break:", error);
    return {
      success: false,
      error: error.message || "Failed to delete break",
    };
  }
}

/**
 * Get breaks for a time entry
 */
export async function getBreaksForTimeEntry(timeEntryId: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();

    // Verify ownership
    const entry = await prisma.timeEntry.findUnique({
      where: { id: timeEntryId },
      select: { userId: true },
    });

    if (!entry || entry.userId !== user.id) {
      return [];
    }

    const breaks = await prisma.timeEntryBreak.findMany({
      where: { timeEntryId },
      orderBy: { startedAt: "asc" },
    });

    // Calculate current duration for ongoing breaks
    return breaks.map((breakRecord) => {
      let duration = breakRecord.duration;
      if (!breakRecord.endedAt) {
        // Break is still ongoing, calculate current duration
        const now = new Date();
        duration = Math.floor((now.getTime() - breakRecord.startedAt.getTime()) / 1000);
      }
      return {
        ...breakRecord,
        duration,
      };
    });
  } catch (error: any) {
    console.error("Error fetching breaks for time entry:", error);
    return [];
  }
}
