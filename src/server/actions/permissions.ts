"use server";

import { prisma } from "@/lib/db/prisma";
import { requirePermission, requireAnyPermission } from "@/lib/utils/auth-server";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { parseTicketPermissionKey, isDynamicTicketPermission } from "@/lib/utils/permissions";

/**
 * Get all available permissions
 */
export async function getPermissions() {
  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  return prisma.permission.findMany({
    orderBy: [
      { category: "asc" },
      { name: "asc" },
    ],
  });
}

/**
 * Get permissions by category
 */
export async function getPermissionsByCategory(category: string) {
  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  return prisma.permission.findMany({
    where: { category },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all permission categories
 */
export async function getPermissionCategories() {
  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  const categories = await prisma.permission.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });

  return categories.map((c) => c.category);
}

/**
 * Get permissions for a specific group
 */
export async function getGroupPermissions(groupId: string) {
  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  const groupPermissions = await prisma.groupPermission.findMany({
    where: { groupId },
    include: {
      permission: true,
    },
    orderBy: {
      permission: {
        category: "asc",
      },
    },
  });

  return groupPermissions.map((gp) => gp.permission);
}

/**
 * Get dynamic ticket permissions for a specific group
 */
export async function getGroupDynamicTicketPermissions(groupId: string) {
  await requireAnyPermission("admin.permissions.view", "admin.permissions.manage");

  const groupPermissions = await prisma.groupPermission.findMany({
    where: { groupId },
    include: {
      permission: true,
    },
  });

  // Filter for dynamic ticket permissions
  return groupPermissions
    .map((gp) => gp.permission)
    .filter((p) => isDynamicTicketPermission(p.key))
    .map((p) => {
      const parsed = parseTicketPermissionKey(p.key);
      return {
        ...p,
        ticketId: parsed?.ticketId || null,
        prefix: parsed?.prefix || null,
        action: parsed?.action || null,
      };
    });
}

/**
 * Seed permissions into the database
 * This should be run once to populate the permissions table
 */
export async function seedPermissions() {
  await requirePermission("admin.permissions.manage");

  const results = {
    created: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const permission of PERMISSIONS) {
    try {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: {
          name: permission.name,
          description: permission.description,
          category: permission.category,
          module: permission.module || null,
        },
        create: {
          key: permission.key,
          name: permission.name,
          description: permission.description,
          category: permission.category,
          module: permission.module || null,
        },
      });
      results.created++;
    } catch (error: any) {
      results.errors.push(`Failed to seed ${permission.key}: ${error.message}`);
    }
  }

  return results;
}
