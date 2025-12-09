/**
 * Seed permissions into the database
 * Run this script to populate the permissions table with all available permissions
 * 
 * Usage: npx tsx scripts/seed-permissions.ts
 */

import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/lib/constants/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting permission seeding...");

  const results = {
    created: 0,
    updated: 0,
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

  console.log("\n=== Seeding Summary ===");
  console.log(`Created: ${results.created}`);
  console.log(`Updated: ${results.updated}`);
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
