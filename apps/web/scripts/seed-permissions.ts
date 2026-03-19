/**
 * Seed permissions into the database
 * Run this script to populate the permissions table with all available permissions
 * 
 * Usage: npx tsx scripts/seed-permissions.ts
 */

import { PrismaClient } from "../src/generated/prisma";
import { PERMISSIONS } from "../src/lib/constants/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting permission seeding...");

  const results = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const permission of PERMISSIONS) {
    try {
      const existing = await prisma.permission.findUnique({
        where: { key: permission.key },
      });

      if (existing) {
        // Update existing permission
        await prisma.permission.update({
          where: { key: permission.key },
          data: {
            name: permission.name,
            description: permission.description,
            category: permission.category,
            module: permission.module || null,
          },
        });
        results.updated++;
        console.log(`✓ Updated: ${permission.key}`);
      } else {
        // Create new permission
        await prisma.permission.create({
          data: {
            key: permission.key,
            name: permission.name,
            description: permission.description,
            category: permission.category,
            module: permission.module || null,
          },
        });
        results.created++;
        console.log(`✓ Created: ${permission.key}`);
      }
    } catch (error: any) {
      results.errors.push(`Failed to seed ${permission.key}: ${error.message}`);
      console.error(`✗ Error: ${permission.key} - ${error.message}`);
    }
  }

  // Remove permissions that are no longer defined in code
  try {
    const definedKeys = PERMISSIONS.map((p) => p.key);

    // Find permissions that exist in DB but are no longer defined
    const obsoletePermissions = await prisma.permission.findMany({
      where: {
        key: {
          notIn: definedKeys,
        },
      },
      select: {
        id: true,
        key: true,
      },
    });

    if (obsoletePermissions.length > 0) {
      const obsoleteIds = obsoletePermissions.map((p: { id: string; key: string }) => p.id);

      const deleteResult = await prisma.permission.deleteMany({
        where: {
          id: {
            in: obsoleteIds,
          },
        },
      });

      results.deleted += deleteResult.count;

      console.log("\nRemoved obsolete permissions:");
      obsoletePermissions.forEach((p: { id: string; key: string }) => {
        console.log(`- ${p.key}`);
      });
    }
  } catch (error: any) {
    results.errors.push(`Failed to remove obsolete permissions: ${error.message}`);
    console.error(`✗ Error while removing obsolete permissions: ${error.message}`);
  }

  console.log("\n=== Seeding Summary ===");
  console.log(`Created: ${results.created}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Deleted: ${results.deleted}`);
  console.log(`Skipped: ${results.skipped}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
    results.errors.forEach((error) => console.error(`  - ${error}`));
  }
  console.log("\nPermission seeding completed!");
}

main()
  .catch((error) => {
    console.error("Fatal error during seeding:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
