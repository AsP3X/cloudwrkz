"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { cookies } from "next/headers";

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
 * Returns consent status for both authenticated and non-authenticated users
 */
export async function checkCookieConsent(): Promise<
  | { success: true; accepted: boolean; acceptedAt: Date | null; isLoggedIn: boolean }
  | { success: false; error: string }
> {
  try {
    // Get current user (returns null if not authenticated)
    const { getCurrentUser } = await import("@/lib/utils/auth-server");
    const user = await getCurrentUser();

    // If user is not authenticated, check cookie instead
    if (!user) {
      const cookieStore = await cookies();
      const consentCookie = cookieStore.get("cookie-consent-accepted");
      const accepted = consentCookie?.value === "true";
      
      return {
        success: true,
        accepted,
        acceptedAt: accepted ? new Date() : null,
        isLoggedIn: false,
      };
    }

    // Get user's cookie consent status from database
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
      isLoggedIn: true,
    };
  } catch (error) {
    console.error("Error checking cookie consent:", error);
    return {
      success: false,
      error: "An error occurred while checking cookie preferences",
    };
  }
}

/**
 * Server action to accept cookie consent for non-authenticated users
 * Sets a cookie instead of using database
 */
export async function acceptCookieConsentForGuest(): Promise<
  | { success: true; message?: string }
  | { success: false; error: string }
> {
  try {
    const cookieStore = await cookies();
    
    // Set cookie consent cookie (expires in 1 year)
    cookieStore.set("cookie-consent-accepted", "true", {
      httpOnly: false, // Allow client-side access
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });

    return {
      success: true,
      message: "Cookie consent saved successfully",
    };
  } catch (error) {
    console.error("Error accepting cookie consent for guest:", error);
    return {
      success: false,
      error: "An error occurred while saving cookie preferences. Please try again.",
    };
  }
}

