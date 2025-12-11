"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/utils/auth-server";
import { Prisma } from "@prisma/client";

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, string>;
}

interface ModuleFilterData {
  presets?: FilterPreset[];
  lastUsedPresetId?: string;
  currentFilters?: Record<string, string>;
}

/**
 * Get filter preferences for a specific module
 */
export async function getFilterPreferences(moduleName: string) {
  try {
    const user = await requireAuth();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    if (!dbUser?.filterPreferences || typeof dbUser.filterPreferences !== "object") {
      return { success: true, data: null };
    }

    const preferences = dbUser.filterPreferences as Record<string, ModuleFilterData>;
    const moduleData = preferences[moduleName];

    if (!moduleData) {
      return { success: true, data: null };
    }

    return { success: true, data: moduleData.currentFilters || null };
  } catch (error) {
    console.error("Failed to get filter preferences:", error);
    return { success: false, error: "Failed to load filter preferences" };
  }
}

/**
 * Get filter presets for a specific module
 */
export async function getFilterPresets(moduleName: string) {
  try {
    const user = await requireAuth();

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    if (!dbUser?.filterPreferences || typeof dbUser.filterPreferences !== "object") {
      return { success: true, data: { presets: [], lastUsedPresetId: null } };
    }

    const preferences = dbUser.filterPreferences as Record<string, ModuleFilterData>;
    const moduleData = preferences[moduleName];

    if (!moduleData) {
      return { success: true, data: { presets: [], lastUsedPresetId: null } };
    }

    return {
      success: true,
      data: {
        presets: moduleData.presets || [],
        lastUsedPresetId: moduleData.lastUsedPresetId || null,
      },
    };
  } catch (error) {
    console.error("Failed to get filter presets:", error);
    return { success: false, error: "Failed to load filter presets" };
  }
}

/**
 * Save filter preferences for a specific module
 */
export async function saveFilterPreferences(
  moduleName: string,
  filters: Record<string, string>
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.filterPreferences as Record<string, ModuleFilterData>) || {};

    // Update preferences for this module
    const moduleData: ModuleFilterData = {
      ...currentPreferences[moduleName],
      currentFilters: filters,
    };

    const updatedPreferences = {
      ...currentPreferences,
      [moduleName]: moduleData,
    };

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPreferences: updatedPreferences as Prisma.InputJsonValue,
      },
    });

    return { success: true, message: "Filter preferences saved" };
  } catch (error) {
    console.error("Failed to save filter preferences:", error);
    return { success: false, error: "Failed to save filter preferences" };
  }
}

/**
 * Save a filter preset
 */
export async function saveFilterPreset(
  moduleName: string,
  preset: FilterPreset
): Promise<ActionResult<FilterPreset>> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.filterPreferences as Record<string, ModuleFilterData>) || {};

    const moduleData: ModuleFilterData = currentPreferences[moduleName] || {
      presets: [],
    };

    const presets = moduleData.presets || [];
    const existingIndex = presets.findIndex((p) => p.id === preset.id);

    let updatedPresets: FilterPreset[];
    if (existingIndex >= 0) {
      // Update existing preset
      updatedPresets = [...presets];
      updatedPresets[existingIndex] = preset;
    } else {
      // Add new preset
      updatedPresets = [...presets, preset];
    }

    const updatedModuleData: ModuleFilterData = {
      ...moduleData,
      presets: updatedPresets,
      lastUsedPresetId: preset.id,
    };

    const updatedPreferences = {
      ...currentPreferences,
      [moduleName]: updatedModuleData,
    };

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPreferences: updatedPreferences as Prisma.InputJsonValue,
      },
    });

    return { success: true, data: preset, message: "Filter preset saved" };
  } catch (error) {
    console.error("Failed to save filter preset:", error);
    return { success: false, error: "Failed to save filter preset" };
  }
}

/**
 * Delete a filter preset
 */
export async function deleteFilterPreset(
  moduleName: string,
  presetId: string
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.filterPreferences as Record<string, ModuleFilterData>) || {};

    const moduleData: ModuleFilterData = currentPreferences[moduleName] || {
      presets: [],
    };

    const presets = (moduleData.presets || []).filter((p) => p.id !== presetId);
    let lastUsedPresetId = moduleData.lastUsedPresetId;
    if (lastUsedPresetId === presetId) {
      lastUsedPresetId = undefined;
    }

    const updatedModuleData: ModuleFilterData = {
      ...moduleData,
      presets,
      lastUsedPresetId,
    };

    const updatedPreferences = {
      ...currentPreferences,
      [moduleName]: updatedModuleData,
    };

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPreferences: updatedPreferences as Prisma.InputJsonValue,
      },
    });

    return { success: true, message: "Filter preset deleted" };
  } catch (error) {
    console.error("Failed to delete filter preset:", error);
    return { success: false, error: "Failed to delete filter preset" };
  }
}

/**
 * Set the last used preset ID
 */
export async function setLastUsedPreset(
  moduleName: string,
  presetId: string | null
): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.filterPreferences as Record<string, ModuleFilterData>) || {};

    const moduleData: ModuleFilterData = currentPreferences[moduleName] || {
      presets: [],
    };

    const updatedModuleData: ModuleFilterData = {
      ...moduleData,
      lastUsedPresetId: presetId || undefined,
    };

    const updatedPreferences = {
      ...currentPreferences,
      [moduleName]: updatedModuleData,
    };

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPreferences: updatedPreferences as Prisma.InputJsonValue,
      },
    });

    return { success: true, message: "Last used preset updated" };
  } catch (error) {
    console.error("Failed to set last used preset:", error);
    return { success: false, error: "Failed to set last used preset" };
  }
}

/**
 * Clear filter preferences for a specific module
 */
export async function clearFilterPreferences(moduleName: string): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    // Get current preferences
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        filterPreferences: true,
      },
    });

    const currentPreferences =
      (dbUser?.filterPreferences as Record<string, Record<string, string>>) || {};

    // Remove preferences for this module
    const updatedPreferences = { ...currentPreferences };
    delete updatedPreferences[moduleName];

    // Save to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        filterPreferences: Object.keys(updatedPreferences).length > 0 
          ? (updatedPreferences as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    return { success: true, message: "Filter preferences cleared" };
  } catch (error) {
    console.error("Failed to clear filter preferences:", error);
    return { success: false, error: "Failed to clear filter preferences" };
  }
}
