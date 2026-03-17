import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
import { hasPermission, hasAnyPermission, type PermissionKey, type DynamicPermissionKey } from "./permissions";
import { isDatabaseConnectionError } from "./db-health";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Custom error class for database connection issues
 */
export class DatabaseConnectionError extends Error {
  constructor(message: string = "Database connection unavailable") {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "MODERATOR" | "AGENT";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BANNED" | "DELETED";
  emailVerified: boolean;
  timezone?: string;
  theme?: string;
  /** Profile picture URL (e.g. /uploads/avatars/...) */
  avatar?: string | null;
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
            theme: true,
            avatar: true,
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
      theme: session.user.theme ?? "system",
      avatar: session.user.avatar ?? null,
    };
  } catch (error) {
    // Check if this is a database connection error
    if (isDatabaseConnectionError(error)) {
      console.error("Database connection error in getCurrentUser:", error);
      // Re-throw as DatabaseConnectionError so it can be caught and handled appropriately
      throw new DatabaseConnectionError("Database is not available");
    }
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Get current user from Bearer token in Authorization header.
 * Used by API routes called by the iOS app (e.g. GET /api/auth/me).
 */
export async function getCurrentUserFromBearerToken(request: Request): Promise<CurrentUser | null> {
  try {
    const auth = request.headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
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
            theme: true,
            avatar: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) return null;
    if (session.user.status === "DELETED" || session.user.status !== "ACTIVE" || !session.user.emailVerified) {
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
      theme: session.user.theme ?? "system",
      avatar: session.user.avatar ?? null,
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) throw error;
    console.error("Error in getCurrentUserFromBearerToken:", error);
    return null;
  }
}

/**
 * Extend session if valid and has less than 7 days until expiry.
 * Used by POST /api/auth/extend-session and POST /api/extend-session (iOS app on open).
 */
export async function extendSessionIfNeeded(request: Request): Promise<NextResponse> {
  try {
    const auth = request.headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const session = await prisma.session.findUnique({
      where: { token },
      select: { id: true, expiresAt: true, user: { select: { status: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.status !== "ACTIVE") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();
    const remainingMs = session.expiresAt.getTime() - now;
    if (remainingMs >= SESSION_LIFETIME_MS) {
      return NextResponse.json({ extended: false }, { status: 200 });
    }

    const newExpiresAt = new Date(now + SESSION_LIFETIME_MS);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiresAt },
    });

    return NextResponse.json({ extended: true }, { status: 200 });
  } catch (error) {
    if (isDatabaseConnectionError(error)) throw error;
    console.error("Error in extendSessionIfNeeded:", error);
    return NextResponse.json(
      { message: "Failed to extend session" },
      { status: 500 }
    );
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
    // Check if this is a database connection error
    if (isDatabaseConnectionError(error)) {
      console.error("Database connection error in getBannedUserInfo:", error);
      throw new DatabaseConnectionError("Database is not available");
    }
    console.error("Error getting banned user info:", error);
    return null;
  }
}

/**
 * Require a specific permission - throws error if user doesn't have it
 * Supports both static permissions and dynamic ticket permissions.
 *
 * Note: Admins no longer automatically bypass permission checks.
 * They must have the permission via role defaults or group membership.
 */
export async function requirePermission(permissionKey: DynamicPermissionKey): Promise<CurrentUser> {
  const user = await requireAuth();

  const hasAccess = await hasPermission(user.id, permissionKey);
  
  if (!hasAccess) {
    throw new Error(`Forbidden: Missing permission '${permissionKey}'`);
  }
  
  return user;
}

/**
 * Require any of the specified permissions - throws error if user doesn't have any
 * Supports both static permissions and dynamic ticket permissions.
 *
 * Note: Admins no longer automatically bypass permission checks.
 * They must have at least one of the permissions via role defaults or group membership.
 */
export async function requireAnyPermission(...permissionKeys: DynamicPermissionKey[]): Promise<CurrentUser> {
  const user = await requireAuth();

  const hasAccess = await hasAnyPermission(user.id, permissionKeys);
  
  if (!hasAccess) {
    throw new Error(`Forbidden: Missing required permissions`);
  }
  
  return user;
}

/**
 * Require a specific permission for admin pages - redirects to dashboard if missing.
 * Use this in admin page components for a user-friendly "access denied" experience.
 */
export async function requirePermissionOrRedirect(
  permissionKey: DynamicPermissionKey,
  redirectTo: string = ROUTES.DASHBOARD
): Promise<CurrentUser> {
  const user = await requireAuth();
  const hasAccess = await hasPermission(user.id, permissionKey);
  if (!hasAccess) {
    redirect(redirectTo);
  }
  return user;
}

/**
 * Require any of the specified permissions for admin pages - redirects to dashboard if missing.
 * Use this in admin page components for a user-friendly "access denied" experience.
 */
export async function requireAnyPermissionOrRedirect(
  redirectTo: string,
  ...permissionKeys: DynamicPermissionKey[]
): Promise<CurrentUser> {
  const user = await requireAuth();
  const hasAccess = await hasAnyPermission(user.id, permissionKeys);
  if (!hasAccess) {
    redirect(redirectTo);
  }
  return user;
}
