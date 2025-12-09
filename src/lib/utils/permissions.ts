/**
 * Permission checking utilities
 * Functions to check user permissions based on role and group membership
 */

import { prisma } from "@/lib/db/prisma";
import { ROLE_PERMISSIONS, type PermissionKey } from "@/lib/constants/permissions";
import type { CurrentUser } from "./auth-server";

/**
 * Get all permissions for a user (from role + groups)
 */
export async function getUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  // Get user with role
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return new Set();
  }

  // Admins always have all permissions
  if (user.role === "ADMIN") {
    return new Set(ROLE_PERMISSIONS.ADMIN);
  }

  // Get role-based permissions
  const rolePermissions = new Set<PermissionKey>(ROLE_PERMISSIONS[user.role] || []);

  // Get group-based permissions
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const groupPermissions = new Set<PermissionKey>();
  for (const membership of memberships) {
    for (const groupPermission of membership.group.permissions) {
      groupPermissions.add(groupPermission.permission.key as PermissionKey);
    }
  }

  // Combine role and group permissions (union)
  return new Set([...rolePermissions, ...groupPermissions]);
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.has(permissionKey);
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionKeys: PermissionKey[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionKeys.some((key) => permissions.has(key));
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissionKeys: PermissionKey[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionKeys.every((key) => permissions.has(key));
}

/**
 * Get cached user permissions (for use in request context)
 * This should be called once per request and cached
 */
const permissionCache = new Map<string, { permissions: Set<PermissionKey>; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function getCachedUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  const cached = permissionCache.get(userId);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.permissions;
  }

  const permissions = await getUserPermissions(userId);
  permissionCache.set(userId, { permissions, timestamp: now });
  return permissions;
}

/**
 * Clear permission cache for a user (call after permission changes)
 */
export function clearPermissionCache(userId?: string): void {
  if (userId) {
    permissionCache.delete(userId);
  } else {
    permissionCache.clear();
  }
}
