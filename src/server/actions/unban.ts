"use server";

import { prisma } from "@/lib/db/prisma";
import { getBannedUserInfo } from "@/lib/utils/auth-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTicketTypePrefix, generateTicketNumber, parseTicketNumber } from "@/lib/utils/tickets";
import { logTicketActivity } from "../utils/ticket-activity-logger";
import { formatDateTime } from "@/lib/utils/date";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type UnbanRequestResult = {
  requestId: string;
  ticketNumber?: string;
};

export type PendingUnbanRequest = {
  id: string;
  reason: string;
  status: string;
  createdAt: Date;
  ticketId: string | null;
  ticketNumber: string | null;
};

const unbanRequestSchema = z.object({
  reason: z.string().min(10, "Please provide a detailed reason (at least 10 characters)"),
});

/**
 * Get pending unban request for the current banned user
 */
export async function getPendingUnbanRequest(): Promise<PendingUnbanRequest | null> {
  try {
    const userInfo = await getBannedUserInfo();

    if (!userInfo) {
      return null;
    }

    const request = await prisma.unbanRequest.findFirst({
      where: {
        userId: userInfo.id,
        status: "PENDING",
      },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        ticketId: true,
        ticket: {
          select: {
            ticketNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!request) {
      return null;
    }

    return {
      id: request.id,
      reason: request.reason,
      status: request.status,
      createdAt: request.createdAt,
      ticketId: request.ticketId,
      ticketNumber: request.ticket?.ticketNumber || null,
    };
  } catch (error) {
    console.error("Get pending unban request error:", error);
    return null;
  }
}

/**
 * Create an unban request (for banned users)
 * Also creates a ticket if the tickets module is enabled
 */
export async function createUnbanRequest(
  input: z.infer<typeof unbanRequestSchema>
): Promise<ActionResult<UnbanRequestResult>> {
  try {
    // Get banned user info from session
    const userInfo = await getBannedUserInfo();

    if (!userInfo) {
      return {
        success: false,
        error: "You must be logged in as a banned user to submit an unban request",
      };
    }

    const validationResult = unbanRequestSchema.safeParse(input);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      validationResult.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      });

      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const { reason } = validationResult.data;

    // Check if there's already a pending request
    const existingRequest = await prisma.unbanRequest.findFirst({
      where: {
        userId: userInfo.id,
        status: "PENDING",
      },
    });

    if (existingRequest) {
      return {
        success: false,
        error: "You already have a pending unban request. Please wait for it to be reviewed.",
      };
    }

    let ticketId: string | undefined;
    let ticketNumber: string | undefined;

    // Create a ticket if the tickets module is enabled
    const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);
    if (ticketsEnabled) {
      try {
        const ticketType = "SUPPORT";
        const prefix = getTicketTypePrefix(ticketType);

        // Find the highest sequence number for this prefix
        const existingTickets = await prisma.ticket.findMany({
          where: {
            ticketNumber: {
              startsWith: `#${prefix}-`,
            },
          },
          select: {
            ticketNumber: true,
          },
          orderBy: {
            ticketNumber: "desc",
          },
          take: 1,
        });

        let nextSequence = 1;
        if (existingTickets.length > 0) {
          const parsed = parseTicketNumber(existingTickets[0].ticketNumber);
          if (parsed) {
            nextSequence = parsed.sequence + 1;
          }
        }

        ticketNumber = generateTicketNumber(prefix, nextSequence);

        const ticketTitle = `Unban Request - ${userInfo.email}`;
        const ticketDescription = `User: ${userInfo.email}${userInfo.name ? ` (${userInfo.name})` : ""}\n\nReason for unban request:\n${reason}\n\nOriginal ban reason: ${userInfo.banReason || "Not provided"}\nBanned on: ${userInfo.bannedAt ? formatDateTime(userInfo.bannedAt) : "Unknown"}`;

        const ticket = await prisma.ticket.create({
          data: {
            ticketNumber,
            title: ticketTitle,
            description: ticketDescription,
            type: ticketType,
            priority: "HIGH",
            status: "OPEN",
            createdById: userInfo.id,
            createdByName: userInfo.name || userInfo.email,
            tags: ["unban-request"],
          },
          select: {
            id: true,
            ticketNumber: true,
          },
        });

        ticketId = ticket.id;

        // Log ticket creation
        await logTicketActivity(
          ticket.id,
          "CREATED",
          userInfo.id,
          userInfo.name
        );
      } catch (ticketError: any) {
        console.error("Error creating ticket for unban request:", ticketError);
        // Return error instead of silently continuing
        return {
          success: false,
          error: `Failed to create ticket: ${ticketError.message || "Unknown error"}. Please try again or contact support.`,
        };
      }
    }

    // Create unban request
    const unbanRequest = await prisma.unbanRequest.create({
      data: {
        userId: userInfo.id,
        reason,
        status: "PENDING",
        ticketId: ticketId || null,
      },
      select: {
        id: true,
      },
    });

    revalidatePath("/banned");
    if (ticketsEnabled) {
      revalidatePath("/dashboard/tickets");
      revalidatePath("/dashboard/admin/tickets");
    }

    return {
      success: true,
      data: {
        requestId: unbanRequest.id,
        ticketNumber: ticketNumber,
      },
      message: ticketNumber
        ? `Unban request submitted successfully. Your request ID is ${unbanRequest.id} and ticket number is ${ticketNumber}. An administrator will review your request.`
        : `Unban request submitted successfully. Your request ID is ${unbanRequest.id}. An administrator will review your request.`,
    };
  } catch (error: any) {
    console.error("Create unban request error:", error);
    return {
      success: false,
      error: error.message || "Failed to submit unban request",
    };
  }
}
