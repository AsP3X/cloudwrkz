import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, hasAnyPermission, type PermissionKey, type DynamicPermissionKey } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "MODERATOR" | "AGENT";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";
  emailVerified: boolean;
   timezone?: string;
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
            timezone: true,
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

    // Explicitly reject deleted users
    if (session.user.status === "DELETED") {
      return null;
    }

    // Check if user account is active and verified
    // Only ACTIVE users with verified emails can access protected pages
    if (
      session.user.status !== "ACTIVE" ||
      !session.user.emailVerified
    ) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      status: session.user.status,
      emailVerified: session.user.emailVerified,
      timezone: session.user.timezone ?? "UTC",
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

/**
 * Require one of multiple roles - throws error if user doesn't have any of the required roles
 */
export async function requireAnyRole(...requiredRoles: Array<"USER" | "ADMIN" | "MODERATOR" | "AGENT">): Promise<CurrentUser> {
  const user = await requireAuth();
  
  if (!requiredRoles.includes(user.role)) {
    throw new Error("Forbidden: Insufficient permissions");
  }
  
  return user;
}

/**
 * Get user info from session including banned users
 * This is used for the banned page to show ban information
 */
export async function getBannedUserInfo(): Promise<{
  id: string;
  email: string;
  name: string | null;
  status: string;
  bannedAt: Date | null;
  banReason: string | null;
} | null> {
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
            status: true,
            bannedAt: true,
            banReason: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    // Only return if user is banned
    if (session.user.status !== "BANNED") {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      status: session.user.status,
      bannedAt: session.user.bannedAt,
      banReason: session.user.banReason,
    };
  } catch (error) {
    console.error("Error getting banned user info:", error);
    return null;
  }
}

/**
 * Require a specific permission - throws error if user doesn't have it
 * Admins always pass permission checks
 * Supports both static permissions and dynamic ticket permissions
 */
export async function requirePermission(permissionKey: DynamicPermissionKey): Promise<CurrentUser> {
  const user = await requireAuth();
  
  // Admins always have all permissions
  if (user.role === "ADMIN") {
    return user;
  }
  
  const hasAccess = await hasPermission(user.id, permissionKey);
  
  if (!hasAccess) {
    throw new Error(`Forbidden: Missing permission '${permissionKey}'`);
  }
  
  return user;
}

/**
 * Require any of the specified permissions - throws error if user doesn't have any
 * Admins always pass permission checks
 * Supports both static permissions and dynamic ticket permissions
 */
export async function requireAnyPermission(...permissionKeys: DynamicPermissionKey[]): Promise<CurrentUser> {
  const user = await requireAuth();
  
  // Admins always have all permissions
  if (user.role === "ADMIN") {
    return user;
  }
  
  const hasAccess = await hasAnyPermission(user.id, permissionKeys);
  
  if (!hasAccess) {
    throw new Error(`Forbidden: Missing required permissions`);
  }
  
  return user;
}
