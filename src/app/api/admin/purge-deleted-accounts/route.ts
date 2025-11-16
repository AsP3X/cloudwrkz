import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * API Route to purge accounts that have been flagged for deletion
 * This should be called by a cron job (e.g., daily)
 * 
 * Purges accounts that:
 * - Have status DELETED
 * - Have scheduledForDeletionAt set
 * - Were scheduled for deletion more than 30 days ago
 * 
 * Security: In production, this should be protected with an API key or authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add API key authentication here
    // const apiKey = request.headers.get("x-api-key");
    // if (apiKey !== process.env.CRON_API_KEY) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find all users scheduled for deletion more than 30 days ago
    const usersToPurge = await prisma.user.findMany({
      where: {
        status: "DELETED",
        scheduledForDeletionAt: {
          not: null,
          lte: thirtyDaysAgo,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (usersToPurge.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No accounts to purge",
        purgedCount: 0,
      });
    }

    let purgedCount = 0;
    const errors: string[] = [];

    // Purge each account
    for (const user of usersToPurge) {
      try {
        // Delete user - cascading deletes will handle related data
        // Sessions are already deleted when account was flagged
        // Tickets created by user will be deleted (Cascade)
        // Comments by user will be deleted (Cascade)
        // Group memberships will be deleted (Cascade)
        // Assigned tickets will be unassigned (SetNull)
        
        await prisma.user.delete({
          where: { id: user.id },
        });

        purgedCount++;
      } catch (error) {
        console.error(`Error purging user ${user.id} (${user.email}):`, error);
        errors.push(`Failed to purge ${user.email}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Purged ${purgedCount} account(s)`,
      purgedCount,
      totalFound: usersToPurge.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in purge-deleted-accounts route:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An error occurred while purging accounts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for manual testing/verification
 * Returns count of accounts scheduled for deletion
 */
export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const count = await prisma.user.count({
      where: {
        status: "DELETED",
        scheduledForDeletionAt: {
          not: null,
          lte: thirtyDaysAgo,
        },
      },
    });

    return NextResponse.json({
      accountsReadyForPurge: count,
      purgeThreshold: "30 days",
    });
  } catch (error) {
    console.error("Error in purge-deleted-accounts GET route:", error);
    return NextResponse.json(
      {
        error: "An error occurred",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

