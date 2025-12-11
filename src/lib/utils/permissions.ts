/**
 * Permission checking utilities
 * Functions to check user permissions based on role and group membership
 */

import { prisma } from "@/lib/db/prisma";
import { ROLE_PERMISSIONS, type PermissionKey } from "@/lib/constants/permissions";
import type { CurrentUser } from "./auth-server";

// Re-export PermissionKey for convenience
export type { PermissionKey };

/**
 * Dynamic permission key type - includes both static PermissionKey and dynamic permissions
 */
export type DynamicPermissionKey = PermissionKey | string;

/**
 * Ticket permission actions that can be used for dynamic ticket permissions
 */
export const TICKET_PERMISSION_ACTIONS = [
  "view",
  "comment",
  "create",
  "update",
  "delete",
  "assign",
  "time_entries.view",
  "time_entries.create",
] as const;

export type TicketPermissionAction = (typeof TICKET_PERMISSION_ACTIONS)[number];

/**
 * Generate a dynamic ticket permission key
 * @param ticketId - The ticket's unique database ID (e.g., "clx123abc456")
 * @param ticketPrefix - The ticket type prefix (e.g., "inc", "src", "bug")
 * @param action - The permission action (e.g., "view", "comment", "create")
 * @returns The permission key (e.g., "tickets.inc-clx123abc456.view")
 */
export function generateTicketPermissionKey(
  ticketId: string,
  ticketPrefix: string,
  action: TicketPermissionAction
): string {
  // Normalize prefix to lowercase
  const normalizedPrefix = ticketPrefix.toLowerCase();
  return `tickets.${normalizedPrefix}-${ticketId}.${action}`;
}

/**
 * Parse a dynamic ticket permission key
 * @param permissionKey - The permission key (e.g., "tickets.inc-clx123abc456.view")
 * @returns Object with ticketId, prefix, and action, or null if invalid
 */
export function parseTicketPermissionKey(
  permissionKey: string
): { ticketId: string; prefix: string; action: TicketPermissionAction } | null {
  const match = permissionKey.match(/^tickets\.([^-]+)-([^.]+)\.(.+)$/);
  if (!match) {
    return null;
  }

  const [, prefix, ticketId, action] = match;
  if (!TICKET_PERMISSION_ACTIONS.includes(action as TicketPermissionAction)) {
    return null;
  }

  return {
    ticketId,
    prefix,
    action: action as TicketPermissionAction,
  };
}

/**
 * Check if a permission key is a dynamic ticket permission
 */
export function isDynamicTicketPermission(permissionKey: string): boolean {
  return parseTicketPermissionKey(permissionKey) !== null;
}

/**
 * Validate a ticket ID format (cuid)
 */
export function isValidTicketId(ticketId: string): boolean {
  // CUIDs typically start with 'c' and are 25 characters long
  // But we'll accept any non-empty string that doesn't contain dots or dashes in the middle
  return /^[a-z0-9]+$/.test(ticketId) && ticketId.length > 0;
}

/**
 * Get all permissions for a user (from role + groups)
 * Includes both static permissions and dynamic ticket permissions
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  // Get user with role
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return new Set();
  }

  // Admins always have all permissions (including dynamic ones)
  // For admins, we return all static permissions - dynamic permissions are checked separately
  if (user.role === "ADMIN") {
    return new Set(ROLE_PERMISSIONS.ADMIN);
  }

  // Get role-based permissions
  const rolePermissions = new Set<string>(ROLE_PERMISSIONS[user.role] || []);

  // Get group-based permissions (includes both static and dynamic)
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

  const groupPermissions = new Set<string>();
  for (const membership of memberships) {
    for (const groupPermission of membership.group.permissions) {
      // Include all permissions (both static PermissionKey and dynamic ticket permissions)
      const permissionKey = groupPermission.permission.key;
      groupPermissions.add(permissionKey);
      
      // Debug logging for dynamic permissions
      if (process.env.NODE_ENV === "development" && isDynamicTicketPermission(permissionKey)) {
        console.log(`[getUserPermissions] Found dynamic permission for user ${userId}: ${permissionKey}`);
      }
    }
  }

  // Combine role and group permissions (union)
  const allPermissions = new Set([...rolePermissions, ...groupPermissions]);
  
  if (process.env.NODE_ENV === "development") {
    console.log(`[getUserPermissions] User ${userId} has ${allPermissions.size} total permissions (${rolePermissions.size} role, ${groupPermissions.size} group)`);
    const dynamicPerms = Array.from(allPermissions).filter(p => isDynamicTicketPermission(p));
    if (dynamicPerms.length > 0) {
      console.log(`[getUserPermissions] Dynamic permissions:`, dynamicPerms);
    }
  }
  
  return allPermissions;
}

/**
 * Check if user has a specific permission
 * Supports both static permissions and dynamic ticket permissions
 */
export async function hasPermission(
  userId: string,
  permissionKey: DynamicPermissionKey
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.has(permissionKey);
}

/**
 * Check if user has any of the specified permissions
 * Supports both static permissions and dynamic ticket permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionKeys: DynamicPermissionKey[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionKeys.some((key) => permissions.has(key));
}

/**
 * Check if user has all of the specified permissions
 * Supports both static permissions and dynamic ticket permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissionKeys: DynamicPermissionKey[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionKeys.every((key) => permissions.has(key));
}

/**
 * Get cached user permissions (for use in request context)
 * This should be called once per request and cached
 */
const permissionCache = new Map<string, { permissions: Set<string>; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function getCachedUserPermissions(userId: string): Promise<Set<string>> {
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
    if (process.env.NODE_ENV === "development") {
      console.log(`[clearPermissionCache] Cleared permission cache for user ${userId}`);
    }
  } else {
    permissionCache.clear();
    if (process.env.NODE_ENV === "development") {
      console.log(`[clearPermissionCache] Cleared all permission caches`);
    }
  }
}

/**
 * Check if user has permission for a specific ticket
 * Checks both general ticket permissions and dynamic ticket-specific permissions
 */
export async function hasTicketPermission(
  userId: string,
  ticketId: string,
  ticketPrefix: string,
  action: TicketPermissionAction
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  
  // Check for dynamic ticket-specific permission
  const dynamicKey = generateTicketPermissionKey(ticketId, ticketPrefix, action);
  
  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV === "development") {
    console.log(`[hasTicketPermission] Checking permission for user ${userId}, ticket ${ticketId}, prefix ${ticketPrefix}, action ${action}`);
    console.log(`[hasTicketPermission] Generated dynamic key: ${dynamicKey}`);
    console.log(`[hasTicketPermission] User has ${permissions.size} permissions`);
    console.log(`[hasTicketPermission] Has dynamic key: ${permissions.has(dynamicKey)}`);
    if (permissions.has(dynamicKey)) {
      console.log(`[hasTicketPermission] Found dynamic permission: ${dynamicKey}`);
    } else {
      // Log some sample permissions to help debug
      const samplePerms = Array.from(permissions).filter(p => p.includes("tickets")).slice(0, 5);
      console.log(`[hasTicketPermission] Sample ticket permissions:`, samplePerms);
    }
  }
  
  if (permissions.has(dynamicKey)) {
    return true;
  }
  
  // Check for general ticket permissions
  // For view action, check tickets.view or tickets.view_all
  if (action === "view") {
    const hasGeneral = permissions.has("tickets.view") || permissions.has("tickets.view_all") || permissions.has("admin.tickets.manage");
    if (process.env.NODE_ENV === "development") {
      console.log(`[hasTicketPermission] Has general view permission: ${hasGeneral}`);
    }
    return hasGeneral;
  }
  
  // For comment action, check tickets.comment
  if (action === "comment") {
    return permissions.has("tickets.comment");
  }
  
  // For create action, check tickets.create
  if (action === "create") {
    return permissions.has("tickets.create");
  }
  
  // For update action, check tickets.update
  if (action === "update") {
    return permissions.has("tickets.update");
  }
  
  // For delete action, check tickets.delete
  if (action === "delete") {
    return permissions.has("tickets.delete");
  }
  
  // For assign action, check tickets.assign
  if (action === "assign") {
    return permissions.has("tickets.assign");
  }
  
  // For time_entries actions
  if (action === "time_entries.view") {
    return permissions.has("tickets.time_entries.view");
  }
  
  if (action === "time_entries.create") {
    return permissions.has("tickets.time_entries.create");
  }
  
  return false;
}
