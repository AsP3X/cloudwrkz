"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";

/**
 * Server action to accept cookie consent for the authenticated user
 * Ensures that only the authenticated user can accept cookies for their own account
 */
export async function acceptCookieConsent(): Promise<
  | { success: true; message?: string }
  | { success: false; error: string }
> {
  try {
    // Require authentication - this ensures only authenticated users can call this
    const user = await requireAuth();

    // Update the user's cookie consent status
    // This is scoped to the authenticated user's ID, ensuring security
    await prisma.user.update({
      where: { id: user.id },
      data: {
        cookieConsentAccepted: true,
        cookieConsentAcceptedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Cookie consent saved successfully",
    };
  } catch (error) {
    console.error("Error accepting cookie consent:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return {
        success: false,
        error: "You must be logged in to save cookie preferences",
      };
    }

    return {
      success: false,
      error: "An error occurred while saving cookie preferences. Please try again.",
    };
  }
}

/**
 * Server action to check if the authenticated user has accepted cookie consent
 * Returns null if user is not authenticated
 */
export async function checkCookieConsent(): Promise<
  | { success: true; accepted: boolean; acceptedAt: Date | null }
  | { success: false; error: string }
  | null
> {
  try {
    // Get current user (returns null if not authenticated)
    const { getCurrentUser } = await import("@/lib/utils/auth-server");
    const user = await getCurrentUser();

    // If user is not authenticated, return null (not an error)
    if (!user) {
      return null;
    }

    // Get user's cookie consent status
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        cookieConsentAccepted: true,
        cookieConsentAcceptedAt: true,
      },
    });

    if (!userData) {
      return {
        success: false,
        error: "User not found",
      };
    }

    return {
      success: true,
      accepted: userData.cookieConsentAccepted,
      acceptedAt: userData.cookieConsentAcceptedAt,
    };
  } catch (error) {
    console.error("Error checking cookie consent:", error);
    return {
      success: false,
      error: "An error occurred while checking cookie preferences",
    };
  }
}

