"use server";

import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";

export type CollectionRole = "VIEWER" | "EDITOR";

export type CollectionInput = {
  name: string;
  description?: string;
  color?: string;
};

export type CollectionUpdateInput = Partial<CollectionInput>;

export type CollectionShareInput = {
  userId: string;
  role: CollectionRole;
};

export type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Create a new collection
 */
export async function createCollection(
  input: CollectionInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.create");

    if (!input.name || input.name.trim().length === 0) {
      return {
        success: false,
        error: "Collection name is required",
        fieldErrors: { name: ["Collection name cannot be empty"] },
      };
    }

    const collection = await prisma.collection.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || null,
        ownerId: user.id,
      },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { id: collection.id },
    };
  } catch (error) {
    console.error("Error creating collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create collection",
    };
  }
}

/**
 * Update a collection
 */
export async function updateCollection(
  id: string,
  input: CollectionUpdateInput
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.update");

    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { ownerId: true, members: { where: { userId: user.id, role: "EDITOR" } } },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    // Check if user is owner or editor
    const isOwner = collection.ownerId === user.id;
    const isEditor = collection.members.length > 0;

    if (!isOwner && !isEditor) {
      return {
        success: false,
        error: "You don't have permission to update this collection",
      };
    }

    const updateData: any = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) {
        return {
          success: false,
          error: "Collection name cannot be empty",
          fieldErrors: { name: ["Collection name cannot be empty"] },
        };
      }
      updateData.name = input.name.trim();
    }
    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }
    if (input.color !== undefined) {
      updateData.color = input.color || null;
    }

    await prisma.collection.update({
      where: { id },
      data: updateData,
    });

    revalidatePath("/dashboard/links");
    revalidatePath(`/dashboard/links/collections/${id}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update collection",
    };
  }
}

/**
 * Delete a collection
 */
export async function deleteCollection(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.delete");

    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can delete it",
      };
    }

    await prisma.collection.delete({
      where: { id },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete collection",
    };
  }
}

/**
 * Archive a collection
 */
export async function archiveCollection(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.update");

    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can archive it",
      };
    }

    await prisma.collection.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error archiving collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive collection",
    };
  }
}

/**
 * Unarchive a collection
 */
export async function unarchiveCollection(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.update");

    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can unarchive it",
      };
    }

    await prisma.collection.update({
      where: { id },
      data: { archivedAt: null },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error unarchiving collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unarchive collection",
    };
  }
}

/**
 * Get collections for a user
 */
export async function getCollections(filters?: {
  userId?: string;
  archived?: boolean;
}) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.view");

    const where: any = {
      OR: [
        { ownerId: filters?.userId || user.id },
        {
          members: {
            some: {
              userId: filters?.userId || user.id,
            },
          },
        },
      ],
    };

    if (filters?.archived === true) {
      where.archivedAt = { not: null };
    } else if (filters?.archived === false) {
      where.archivedAt = null;
    }

    const collections = await prisma.collection.findMany({
      where,
      include: {
        _count: {
          select: {
            links: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return collections;
  } catch (error) {
    console.error("Error fetching collections:", error);
    return [];
  }
}

/**
 * Get a single collection with links and members
 */
export async function getCollection(id: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return null;
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.view");

    const collection = await prisma.collection.findFirst({
      where: {
        id,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        links: {
          include: {
            link: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                collections: {
                  include: {
                    collection: {
                      select: {
                        id: true,
                        name: true,
                        color: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            links: true,
            members: true,
          },
        },
      },
    });

    return collection;
  } catch (error) {
    console.error("Error fetching collection:", error);
    return null;
  }
}

/**
 * Share collection with a user
 */
export async function shareCollection(
  collectionId: string,
  input: CollectionShareInput
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.share");

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can share it",
      };
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });

    if (!targetUser) {
      return {
        success: false,
        error: "User not found",
      };
    }

    // Don't allow sharing with owner
    if (input.userId === user.id) {
      return {
        success: false,
        error: "Cannot share collection with yourself",
      };
    }

    // Create or update membership
    await prisma.collectionMember.upsert({
      where: {
        collectionId_userId: {
          collectionId,
          userId: input.userId,
        },
      },
      update: {
        role: input.role,
      },
      create: {
        collectionId,
        userId: input.userId,
        role: input.role,
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath(`/dashboard/links/collections/${collectionId}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error sharing collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to share collection",
    };
  }
}

/**
 * Update collection member role
 */
export async function updateCollectionMember(
  collectionId: string,
  userId: string,
  role: CollectionRole
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.share");

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can update member roles",
      };
    }

    await prisma.collectionMember.update({
      where: {
        collectionId_userId: {
          collectionId,
          userId,
        },
      },
      data: { role },
    });

    revalidatePath("/dashboard/links");
    revalidatePath(`/dashboard/links/collections/${collectionId}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating collection member:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update member role",
    };
  }
}

/**
 * Remove user from collection
 */
export async function removeCollectionMember(
  collectionId: string,
  userId: string
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.share");

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { ownerId: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found",
      };
    }

    if (collection.ownerId !== user.id) {
      return {
        success: false,
        error: "Only the collection owner can remove members",
      };
    }

    // Don't allow removing owner
    if (userId === collection.ownerId) {
      return {
        success: false,
        error: "Cannot remove collection owner",
      };
    }

    await prisma.collectionMember.delete({
      where: {
        collectionId_userId: {
          collectionId,
          userId,
        },
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath(`/dashboard/links/collections/${collectionId}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error removing collection member:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove member",
    };
  }
}

/**
 * Get all members of a collection
 */
export async function getCollectionMembers(collectionId: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.view");

    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!collection) {
      return [];
    }

    const members = await prisma.collectionMember.findMany({
      where: { collectionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return members;
  } catch (error) {
    console.error("Error fetching collection members:", error);
    return [];
  }
}

/**
 * Get all collections user has access to (owned + shared)
 * If userId is empty string, gets collections for current user
 */
export async function getUserCollections(userId: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();
    await requireAnyPermission("collections.view");

    const targetUserId = userId || user.id;

    const collections = await prisma.collection.findMany({
      where: {
        OR: [
          { ownerId: targetUserId },
          {
            members: {
              some: {
                userId: targetUserId,
              },
            },
          },
        ],
        archivedAt: null,
      },
      include: {
        _count: {
          select: {
            links: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return collections;
  } catch (error) {
    console.error("Error fetching user collections:", error);
    return [];
  }
}
