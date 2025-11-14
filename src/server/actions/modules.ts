"use server";

import { prisma } from "@/lib/db/prisma";
import { MODULE_CONFIG, type ModuleKey } from "@/lib/constants/modules";

/**
 * Initialize modules in the database
 * Should be called during setup/migration
 */
export async function initializeModules() {
  const modules = Object.values(MODULE_CONFIG);
  
  for (const moduleConfig of modules) {
    await prisma.module.upsert({
      where: { key: moduleConfig.key },
      update: {
        name: moduleConfig.name,
        description: moduleConfig.description,
      },
      create: {
        key: moduleConfig.key,
        name: moduleConfig.name,
        description: moduleConfig.description,
        enabled: moduleConfig.defaultEnabled,
      },
    });
  }
}

/**
 * Check if a module is enabled
 * Auto-initializes modules if they don't exist
 */
export async function isModuleEnabled(moduleKey: ModuleKey): Promise<boolean> {
  // Check if any modules exist, if not, initialize them
  const moduleCount = await prisma.module.count();
  if (moduleCount === 0) {
    await initializeModules();
  }

  const module = await prisma.module.findUnique({
    where: { key: moduleKey },
    select: { enabled: true },
  });

  return module?.enabled ?? false;
}

/**
 * Get all modules with their enabled status
 * Auto-initializes modules if they don't exist
 */
export async function getAllModules() {
  const modules = await prisma.module.findMany({
    orderBy: { name: "asc" },
  });

  // Auto-initialize if no modules exist
  if (modules.length === 0) {
    await initializeModules();
    return prisma.module.findMany({
      orderBy: { name: "asc" },
    });
  }

  return modules;
}

/**
 * Enable or disable a module (admin only)
 */
export async function setModuleEnabled(
  moduleKey: ModuleKey,
  enabled: boolean
) {
  return prisma.module.update({
    where: { key: moduleKey },
    data: { enabled },
  });
}
