"use server";

import { prisma } from "@/lib/db/prisma";
import { MODULE_CONFIG, type ModuleKey } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";

/**
 * Initialize modules in the database
 * Should be called during setup/migration
 * Also removes modules that are no longer in MODULE_CONFIG
 */
export async function initializeModules() {
  const modules = Object.values(MODULE_CONFIG);
  
  // Upsert all modules from config
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
  
  // Clean up modules that are no longer in the config
  await cleanupUnusedModules();
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

  const moduleRecord = await prisma.module.findUnique({
    where: { key: moduleKey },
    select: { enabled: true },
  });

  return moduleRecord?.enabled ?? false;
}

/**
 * Get all modules with their enabled status
 * Auto-initializes modules if they don't exist
 * Only returns modules that are defined in MODULE_CONFIG
 */
export async function getAllModules() {
  const allModules = await prisma.module.findMany({
    orderBy: { name: "asc" },
  });

  // Auto-initialize if no modules exist
  if (allModules.length === 0) {
    await initializeModules();
    const initializedModules = await prisma.module.findMany({
      orderBy: { name: "asc" },
    });
    // Filter to only return modules in MODULE_CONFIG
    const validModuleKeys = new Set(Object.keys(MODULE_CONFIG));
    return initializedModules.filter((module) => validModuleKeys.has(module.key));
  }

  // Filter to only return modules that are defined in MODULE_CONFIG
  const validModuleKeys = new Set(Object.keys(MODULE_CONFIG));
  return allModules.filter((module) => validModuleKeys.has(module.key));
}

/**
 * Enable or disable a module (admin only)
 */
export async function setModuleEnabled(
  moduleKey: ModuleKey,
  enabled: boolean
) {
  const result = await prisma.module.update({
    where: { key: moduleKey },
    data: { enabled },
  });
  
  // Revalidate the dashboard layout to ensure sidebar updates
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/admin/modules");
  
  return result;
}

/**
 * Remove modules from the database that are no longer in MODULE_CONFIG
 * This is useful for cleaning up deprecated modules
 */
export async function cleanupUnusedModules() {
  const validModuleKeys = new Set(Object.keys(MODULE_CONFIG));
  const allModules = await prisma.module.findMany();
  
  const modulesToDelete = allModules.filter(
    (module) => !validModuleKeys.has(module.key)
  );
  
  if (modulesToDelete.length === 0) {
    return { deleted: 0, message: "No unused modules to clean up" };
  }
  
  const deleted = await prisma.module.deleteMany({
    where: {
      key: {
        in: modulesToDelete.map((m) => m.key),
      },
    },
  });
  
  revalidatePath("/dashboard/admin/modules");
  
  return {
    deleted: deleted.count,
    message: `Removed ${deleted.count} unused module(s)`,
  };
}
