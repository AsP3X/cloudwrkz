"use server";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/utils/auth-server";
import { PERMISSIONS } from "@/lib/constants/permissions";

/**
 * Get all available permissions
 */
export async function getPermissions() {
  await requireRole("ADMIN");

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
  await requireRole("ADMIN");

  return prisma.permission.findMany({
    where: { category },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all permission categories
 */
export async function getPermissionCategories() {
  await requireRole("ADMIN");

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
  await requireRole("ADMIN");

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
 * Seed permissions into the database
 * This should be run once to populate the permissions table
 */
export async function seedPermissions() {
  await requireRole("ADMIN");

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
