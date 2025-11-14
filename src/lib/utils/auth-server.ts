import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "MODERATOR" | "AGENT";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  emailVerified: boolean;
};

/**
 * Get the current authenticated user from session
 * Returns null if not authenticated or session is invalid
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;

    if (!sessionToken) {
      return null;
    }

    // Find session in database
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerified: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      // Delete expired session
      await prisma.session.delete({
        where: { id: session.id },
      });
      return null;
    }

    // Check if user account is active
    if (session.user.status === "DELETED" || session.user.status === "SUSPENDED") {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      status: session.user.status,
      emailVerified: session.user.emailVerified,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Require authentication - throws error if user is not authenticated
 * Use this in server components/actions that require authentication
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }
  
  return user;
}

/**
 * Require specific role - throws error if user doesn't have the required role
 */
export async function requireRole(requiredRole: "USER" | "ADMIN" | "MODERATOR" | "AGENT"): Promise<CurrentUser> {
  const user = await requireAuth();
  
  if (user.role !== requiredRole) {
    throw new Error("Forbidden: Insufficient permissions");
  }
  
  return user;
}
