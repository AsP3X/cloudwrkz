import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromBearerToken } from "@/lib/utils/auth-server";
import { prisma } from "@/lib/db/prisma";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { generateTimerNumber, parseTimerNumber } from "@/lib/utils/time-tracking";
import { timeEntrySelect } from "./get-time-entries-handler";

/**
 * POST /api/time-tracking — create a new RUNNING time entry.
 * Body: { name?, description?, tags?, location?, billable?, ticketId? }
 */
export async function createTimeEntryApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return NextResponse.json({ message: "Time tracking module is not enabled" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // Generate name if not provided
    let name = (body.name as string | undefined)?.trim();
    if (!name) {
      const existing = await prisma.timeEntry.findMany({
        where: {
          OR: [
            { name: { startsWith: "#TMR-" } },
            { name: { startsWith: "TMR-" } },
          ],
        },
        select: { name: true },
        orderBy: { name: "desc" },
        take: 1,
      });

      let nextSequence = 1;
      if (existing.length > 0) {
        const parsed = parseTimerNumber(existing[0].name);
        if (parsed) nextSequence = parsed.sequence + 1;
      }
      name = generateTimerNumber(nextSequence);
    }

    const now = new Date();
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { timezone: true },
    });
    const userTimezone = dbUser?.timezone || "UTC";

    const entry = await prisma.timeEntry.create({
      data: {
        name,
        description: (body.description as string)?.trim() || null,
        tags: (body.tags as string[]) || [],
        userId: user.id,
        ticketId: (body.ticketId as string) || null,
        billable: (body.billable as boolean) ?? false,
        location: (body.location as string)?.trim() || null,
        timezone: userTimezone,
        status: "RUNNING",
        startedAt: now,
        lastResumedAt: now,
        totalDuration: 0,
      },
    });

    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time-tracking]", error);
    return NextResponse.json(
      { message: "Failed to create time entry" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/time-tracking/add — create a STOPPED entry with manual duration.
 * Body: { name?, description?, tags?, location?, billable?, hours, minutes, seconds, startedAt }
 * End time is computed as startedAt + duration. Name is optional; if empty, a timer number (e.g. #TMR-000001) is auto-generated.
 */
export async function addTimeEntryApiHandler(request: NextRequest) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);
    if (!moduleEnabled) {
      return NextResponse.json({ message: "Time tracking module is not enabled" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // Generate name if not provided (same as start timer)
    let name = (body.name as string | undefined)?.trim();
    if (!name) {
      const existing = await prisma.timeEntry.findMany({
        where: {
          OR: [
            { name: { startsWith: "#TMR-" } },
            { name: { startsWith: "TMR-" } },
          ],
        },
        select: { name: true },
        orderBy: { name: "desc" },
        take: 1,
      });

      let nextSequence = 1;
      if (existing.length > 0) {
        const parsed = parseTimerNumber(existing[0].name);
        if (parsed) nextSequence = parsed.sequence + 1;
      }
      name = generateTimerNumber(nextSequence);
    }

    const hours = (body.hours as number) ?? 0;
    const minutes = (body.minutes as number) ?? 0;
    const seconds = (body.seconds as number) ?? 0;
    const totalDuration = hours * 3600 + minutes * 60 + seconds;

    if (totalDuration <= 0) {
      return NextResponse.json({ message: "Duration must be greater than 0" }, { status: 400 });
    }

    const startedAt = body.startedAt ? new Date(body.startedAt as string) : new Date();
    const stoppedAt = new Date(startedAt.getTime() + totalDuration * 1000);

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { timezone: true },
    });
    const userTimezone = dbUser?.timezone || "UTC";

    const entry = await prisma.timeEntry.create({
      data: {
        name,
        description: (body.description as string)?.trim() || null,
        tags: (body.tags as string[]) || [],
        userId: user.id,
        billable: (body.billable as boolean) ?? false,
        location: (body.location as string)?.trim() || null,
        timezone: userTimezone,
        status: "STOPPED",
        startedAt,
        stoppedAt,
        totalDuration,
      },
    });

    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time-tracking/add]", error);
    return NextResponse.json(
      { message: "Failed to add time entry" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/time-tracking/[id] — update a time entry.
 * Body: { name?, description?, tags?, location?, billable?, startedAt?, stoppedAt? }
 */
export async function updateTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true, startedAt: true, stoppedAt: true, totalDuration: true, lastResumedAt: true },
    });

    if (!existing) {
      return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    type UpdateData = Record<string, unknown>;
    const data: UpdateData = {};

    if (body.name !== undefined) data.name = (body.name as string).trim();
    if (body.description !== undefined) data.description = (body.description as string)?.trim() || null;
    if (body.tags !== undefined) data.tags = body.tags as string[];
    if (body.location !== undefined) data.location = (body.location as string)?.trim() || null;
    if (body.billable !== undefined) data.billable = body.billable as boolean;

    if (body.startedAt !== undefined) {
      const parsed = new Date(body.startedAt as string);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ message: "Invalid startedAt date" }, { status: 400 });
      }
      data.startedAt = parsed;
    }

    if (body.stoppedAt !== undefined) {
      if (body.stoppedAt === null) {
        data.stoppedAt = null;
      } else {
        const parsed = new Date(body.stoppedAt as string);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ message: "Invalid stoppedAt date" }, { status: 400 });
        }
        data.stoppedAt = parsed;
      }
    }
    if (body.archivedAt === null) {
      data.archivedAt = null;
    }

    // Recalculate totalDuration when start/stop times change
    const finalStartedAt = (data.startedAt as Date) ?? existing.startedAt;
    const finalStoppedAt = data.stoppedAt !== undefined ? (data.stoppedAt as Date | null) : existing.stoppedAt;

    if (data.startedAt !== undefined || data.stoppedAt !== undefined) {
      if (finalStoppedAt) {
        // Stopped/completed: duration = stoppedAt - startedAt
        const durationSeconds = Math.max(0, Math.floor((finalStoppedAt.getTime() - finalStartedAt.getTime()) / 1000));
        data.totalDuration = durationSeconds;
      } else if (data.startedAt !== undefined) {
        // Active (RUNNING/PAUSED): so displayed duration reflects new start time
        const newStartedAt = data.startedAt as Date;
        if (existing.lastResumedAt == null) {
          // Never paused: client shows elapsed = totalDuration + (now - startedAt). Keep totalDuration 0 and new startedAt so elapsed = (now - newStartedAt).
          data.totalDuration = 0;
          data.lastResumedAt = newStartedAt;
        } else {
          // Has been paused: shift totalDuration by start delta; client uses lastResumedAt for current segment.
          const deltaSeconds = Math.floor((existing.startedAt.getTime() - newStartedAt.getTime()) / 1000);
          data.totalDuration = Math.max(0, existing.totalDuration + deltaSeconds);
        }
      }
    }

    await prisma.timeEntry.update({
      where: { id },
      data,
    });

    return NextResponse.json({ message: "Updated" }, { status: 200 });
  } catch (error) {
    console.error("[PATCH /api/time-tracking/[id]]", error);
    return NextResponse.json(
      { message: "Failed to update time entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/time-tracking/[id] — delete a time entry.
 */
export async function deleteTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Delete breaks first, then the entry
    await prisma.timeEntryBreak.deleteMany({ where: { timeEntryId: id } });
    await prisma.timeEntry.delete({ where: { id } });

    return NextResponse.json({ message: "Deleted" }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/time-tracking/[id]]", error);
    return NextResponse.json(
      { message: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/time-tracking/[id]/pause — pause a RUNNING timer.
 */
export async function pauseTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true, totalDuration: true, lastResumedAt: true, startedAt: true },
    });

    if (!entry) return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    if (entry.status !== "RUNNING") return NextResponse.json({ message: "Timer is not running" }, { status: 400 });

    const now = new Date();
    const referenceDate = entry.lastResumedAt ?? entry.startedAt;
    const elapsedSinceResume = Math.floor((now.getTime() - referenceDate.getTime()) / 1000);
    const newTotalDuration = entry.totalDuration + Math.max(0, elapsedSinceResume);

    await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "PAUSED",
        pausedAt: now,
        totalDuration: newTotalDuration,
      },
    });

    return NextResponse.json({ message: "Paused" }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/time-tracking/[id]/pause]", error);
    return NextResponse.json({ message: "Failed to pause timer" }, { status: 500 });
  }
}

/**
 * POST /api/time-tracking/[id]/resume — resume a PAUSED timer.
 */
export async function resumeTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!entry) return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    if (entry.status !== "PAUSED") return NextResponse.json({ message: "Timer is not paused" }, { status: 400 });

    const now = new Date();
    await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "RUNNING",
        lastResumedAt: now,
        pausedAt: null,
      },
    });

    return NextResponse.json({ message: "Resumed" }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/time-tracking/[id]/resume]", error);
    return NextResponse.json({ message: "Failed to resume timer" }, { status: 500 });
  }
}

/**
 * POST /api/time-tracking/[id]/stop — stop a RUNNING or PAUSED timer.
 */
export async function stopTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true, totalDuration: true, lastResumedAt: true, startedAt: true },
    });

    if (!entry) return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    if (entry.status !== "RUNNING" && entry.status !== "PAUSED") {
      return NextResponse.json({ message: "Timer is not active" }, { status: 400 });
    }

    const now = new Date();
    let finalDuration = entry.totalDuration;

    if (entry.status === "RUNNING") {
      const referenceDate = entry.lastResumedAt ?? entry.startedAt;
      const elapsedSinceResume = Math.floor((now.getTime() - referenceDate.getTime()) / 1000);
      finalDuration = entry.totalDuration + Math.max(0, elapsedSinceResume);
    }

    await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        pausedAt: null,
        totalDuration: finalDuration,
      },
    });

    return NextResponse.json({ message: "Stopped" }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/time-tracking/[id]/stop]", error);
    return NextResponse.json({ message: "Failed to stop timer" }, { status: 500 });
  }
}

/**
 * POST /api/time-tracking/[id]/complete — mark a STOPPED entry as COMPLETED.
 */
export async function completeTimeEntryApiHandler(request: NextRequest, id: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!entry) return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    if (entry.status !== "STOPPED") {
      return NextResponse.json({ message: "Timer must be stopped first" }, { status: 400 });
    }

    await prisma.timeEntry.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "Completed" }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/time-tracking/[id]/complete]", error);
    return NextResponse.json({ message: "Failed to complete timer" }, { status: 500 });
  }
}

/**
 * POST /api/time-tracking/[id]/breaks — add a break to a time entry.
 * Body: { startedAt?, endedAt?, description? } (optional; defaults: startedAt = now, endedAt = null)
 */
export async function addBreakApiHandler(request: NextRequest, timeEntryId: string) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const id = typeof timeEntryId === "string" ? timeEntryId.trim() : "";
  if (!id) {
    return NextResponse.json({ message: "Missing time entry ID" }, { status: 400 });
  }

  try {
    const entry = await prisma.timeEntry.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!entry) return NextResponse.json({ message: "Time entry not found" }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const startedAt = body.startedAt != null ? new Date(body.startedAt as string) : now;
    const endedAt = body.endedAt != null ? new Date(body.endedAt as string) : null;

    if (isNaN(startedAt.getTime())) {
      return NextResponse.json({ message: "Invalid startedAt" }, { status: 400 });
    }
    if (endedAt != null && isNaN(endedAt.getTime())) {
      return NextResponse.json({ message: "Invalid endedAt" }, { status: 400 });
    }

    let duration = 0;
    if (endedAt) {
      duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (duration < 0) {
        return NextResponse.json({ message: "Break end time must be after start time" }, { status: 400 });
      }
    }

    const description = typeof body.description === "string" ? (body.description as string).trim() || null : null;

    const breakRecord = await prisma.timeEntryBreak.create({
      data: {
        timeEntryId: id,
        startedAt,
        endedAt,
        duration,
        description,
      },
    });

    return NextResponse.json({ id: breakRecord.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time-tracking/[id]/breaks]", error);
    return NextResponse.json({ message: "Failed to add break" }, { status: 500 });
  }
}

/**
 * DELETE /api/time-tracking/[id]/breaks/[breakId] — delete a break.
 */
export async function deleteBreakApiHandler(
  request: NextRequest,
  timeEntryId: string,
  breakId: string
) {
  const user = await getCurrentUserFromBearerToken(request);
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const breakRecord = await prisma.timeEntryBreak.findUnique({
      where: { id: breakId },
      select: { timeEntryId: true, timeEntry: { select: { userId: true } } },
    });

    if (!breakRecord) return NextResponse.json({ message: "Break not found" }, { status: 404 });
    if (breakRecord.timeEntry.userId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    if (breakRecord.timeEntryId !== timeEntryId) {
      return NextResponse.json({ message: "Break does not belong to this time entry" }, { status: 400 });
    }

    await prisma.timeEntryBreak.delete({
      where: { id: breakId },
    });

    return NextResponse.json({ message: "Deleted" }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/time-tracking/[id]/breaks/[breakId]]", error);
    return NextResponse.json({ message: "Failed to delete break" }, { status: 500 });
  }
}
