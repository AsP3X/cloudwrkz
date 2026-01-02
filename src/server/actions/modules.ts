"use server";

import { prisma } from "@/lib/db/prisma";
import { MODULE_CONFIG, MODULE_KEYS, type ModuleKey } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import { getUserPermissions } from "@/lib/utils/permissions";

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
 * Check if a user can view a module (module must be enabled AND user must have permission)
 * Auto-initializes modules if they don't exist
 */
export async function canUserViewModule(userId: string, moduleKey: ModuleKey): Promise<boolean> {
  // First check if module is enabled
  const enabled = await isModuleEnabled(moduleKey);
  if (!enabled) {
    return false;
  }

  // Get user to check role
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  // Admins can view all enabled modules
  if (user.role === "ADMIN") {
    return true;
  }

  // Map module keys to permission keys
  const modulePermissionMap: Record<string, string> = {
    [MODULE_KEYS.TICKETS]: "modules.tickets.view",
    [MODULE_KEYS.TIMETRACKING]: "modules.timetracking.view",
    [MODULE_KEYS.TODOS]: "modules.todos.view",
  };

  const permissionKey = modulePermissionMap[moduleKey];
  if (!permissionKey) {
    // If no permission mapping, allow (backward compatibility)
    return true;
  }

  // Check if user has permission to view this module
  const userPermissions = await getUserPermissions(userId);
  
  // Special handling for TODOS: also check for todo-related permissions
  // If user has any todo permission (todos.view, todos.create, etc.), they can see the module
  if (moduleKey === MODULE_KEYS.TODOS) {
    const hasModulePermission = userPermissions.has(permissionKey as any);
    const hasTodoPermission = 
      userPermissions.has("todos.view" as any) ||
      userPermissions.has("todos.create" as any) ||
      userPermissions.has("todos.update" as any) ||
      userPermissions.has("todos.delete" as any);
    
    return hasModulePermission || hasTodoPermission;
  }
  
  return userPermissions.has(permissionKey as any);
}

/**
 * Get all modules with their enabled status
 * Auto-initializes modules if they don't exist
 * Only returns modules that are defined in MODULE_CONFIG
 */
export async function getAllModules() {
  // Always (re)initialize modules to ensure new MODULE_CONFIG entries
  // are created in the database and deprecated ones are cleaned up.
  await initializeModules();

  const allModules = await prisma.module.findMany({
    orderBy: { name: "asc" },
  });
  
  // Return all modules from the database. Since initializeModules keeps
  // the table in sync with MODULE_CONFIG (and cleans up deprecated keys),
  // this will naturally include any newly added modules like tasks.
  return allModules;
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
