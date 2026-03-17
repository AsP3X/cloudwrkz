"use server";

import { type Prisma, Prisma as PrismaRuntime } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { auditLog } from "@/server/utils/audit-log";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
import { getUserPermissions, hasAnyPermission } from "@/lib/utils/permissions";
import { isModuleEnabled } from "./modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { revalidatePath } from "next/cache";
import {
  validateUrl,
  normalizeUrl,
  areUrlsDuplicate,
  formatLinkUrl,
  getFaviconUrl,
  getLinkTypeFromUrl,
} from "@/lib/utils/links";
import { cacheFavicon } from "@/lib/utils/favicon-cache";
import { extractLinkMetadata } from "@/lib/utils/link-metadata";
import { logger } from "@/lib/utils/logger";
import { createLinkSchema, updateLinkSchema, importLinkRowSchema } from "@/lib/validations/links";
import {
  SHARED_WITH_ME_COLLECTION_ID,
  LINK_PAGE_SIZE_OPTIONS,
  LINK_PAGE_SIZE_ALL,
  DEFAULT_LINKS_PAGE_SIZE,
} from "@/lib/constants/links";
import { createCollection } from "./collections";

export type LinkType = "WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER";

export type LinkInput = {
  title?: string; // Optional if metadata extraction will populate it
  url: string;
  description?: string;
  favicon?: string;
  linkType?: LinkType;
  tags?: string[];
  notes?: string; // Personal annotations
  isFavorite?: boolean;
  rating?: number; // 1-5
  collectionIds?: string[]; // Collections to add link to
  extractMetadata?: boolean; // Flag to trigger metadata extraction
  allowDuplicates?: boolean; // Flag to allow creating duplicate links
};

export type LinkUpdateInput = Partial<LinkInput> & {
  collectionIds?: string[]; // Replace all collections
  archivedAt?: Date | null; // Unarchive when null
};

export type LinkFilters = {
  userId?: string;
  linkType?: LinkType;
  tags?: string[];
  collectionId?: string; // Filter by collection (or SHARED_WITH_ME_COLLECTION_ID for shared-with-me)
  sharedWithMe?: boolean; // Show only links shared directly with current user
  search?: string;
  archived?: boolean;
  isFavorite?: boolean; // Filter by favorites
  minRating?: number; // Filter by minimum rating (1-5)
  sortBy?: "createdAt" | "updatedAt" | "title" | "rating";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export type GetLinksResult = {
  links: Array<
    Prisma.LinkGetPayload<{
      select: {
        id: true;
        title: true;
        url: true;
        description: true;
        favicon: true;
        linkType: true;
        tags: true;
        notes: true;
        isFavorite: true;
        rating: true;
        userId: true;
        createdAt: true;
        updatedAt: true;
        collections: {
          select: {
            collection: { select: { id: true; name: true; color: true } };
          };
        };
      };
    }>
  >;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ActionResult<T = void> =
  | {
      success: true;
      data?: T;
      message?: string;
      duplicateLinkIds?: string[];
      similarLinkIds?: string[];
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      duplicateLinkIds?: string[];
      similarLinkIds?: string[];
    };

/**
 * Check for duplicate URLs.
 *
 * Only the full, formatted URL string is used for duplicate detection
 * to avoid false positives from normalization or other heuristics.
 *
 * We still return `similarLinkIds` for backwards compatibility with
 * existing callers, but it will always be an empty array.
 */
export async function checkDuplicateUrl(
  url: string,
  userId: string,
  excludeLinkId?: string
): Promise<{ exactDuplicateIds: string[]; similarLinkIds: string[] }> {
  const duplicates = await prisma.link.findMany({
    where: {
      userId,
      url,
      ...(excludeLinkId ? { id: { not: excludeLinkId } } : {}),
    },
    select: { id: true },
  });

  const exactDuplicateIds = duplicates.map((link) => link.id);

  return { exactDuplicateIds, similarLinkIds: [] };
}

/**
 * Extract metadata for a link
 */
export async function extractLinkMetadataAction(url: string) {
  try {
    const metadata = await extractLinkMetadata(url);
    return {
      success: true as const,
      data: metadata,
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to extract metadata",
    };
  }
}

const LINK_TAG_SUGGESTIONS_LIMIT = 15;

/**
 * Get existing link tags for the current user that match the given query.
 * Used to suggest tags while typing in link forms.
 */
export async function getLinkTagSuggestions(query: string): Promise<string[]> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    const links = await prisma.link.findMany({
      where: { userId: user.id },
      select: { tags: true },
    });

    const allTags = new Set<string>();
    for (const link of links) {
      for (const tag of link.tags) {
        if (tag.trim()) {
          allTags.add(tag.trim());
        }
      }
    }

    const filtered = [...allTags]
      .filter((tag) => tag.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefer tags that start with the query
        const aStarts = a.toLowerCase().startsWith(q);
        const bStarts = b.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b);
      })
      .slice(0, LINK_TAG_SUGGESTIONS_LIMIT);

    return filtered;
  } catch (error) {
    logger.error("Error fetching link tag suggestions:", error);
    return [];
  }
}

/**
 * Refetch and cache favicon for a link based on its URL.
 * Always returns the cached path when possible and updates the link record.
 */
export async function refetchLinkFavicon(
  linkId: string,
  url: string
): Promise<ActionResult<{ favicon: string | null }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.update");

    const existingLink = await prisma.link.findUnique({
      where: { id: linkId },
      select: { id: true, userId: true },
    });

    if (!existingLink || existingLink.userId !== user.id) {
      return {
        success: false,
        error: "Link not found or you don't have permission",
      };
    }

    const formattedUrl = formatLinkUrl(url);
    if (!validateUrl(formattedUrl)) {
      return {
        success: false,
        error: "Invalid URL format",
        fieldErrors: { url: ["Please enter a valid URL"] },
      };
    }

    // Try to extract metadata and use its favicon if it is a real URL
    let faviconUrl: string | undefined;
    try {
      const metadata = await extractLinkMetadata(formattedUrl);
      if (
        metadata?.favicon &&
        (metadata.favicon.startsWith("http://") || metadata.favicon.startsWith("https://"))
      ) {
        faviconUrl = metadata.favicon;
      }
    } catch (error) {
      logger.error("Metadata extraction failed while refetching favicon:", error);
    }

    // Fallback to generic favicon helper if metadata didn't yield one
    if (!faviconUrl) {
      faviconUrl = getFaviconUrl(formattedUrl) || undefined;
    }

    if (!faviconUrl) {
      // Clear favicon if we can't determine a new one
      await prisma.link.update({
        where: { id: linkId },
        data: { favicon: null },
      });
      return {
        success: true,
        data: { favicon: null },
      };
    }

    // Cache favicon locally and always prefer the cached path
    let finalFavicon = faviconUrl;
    try {
      const cached = await cacheFavicon(faviconUrl);
      if (cached) {
        finalFavicon = cached;
      }
    } catch (error) {
      logger.error("Favicon caching failed while refetching:", error);
    }

    await prisma.link.update({
      where: { id: linkId },
      data: { favicon: finalFavicon },
    });

    return {
      success: true,
      data: { favicon: finalFavicon },
    };
  } catch (error) {
    logger.error("Error refetching favicon:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to refetch favicon",
    };
  }
}

/**
 * Internal: create a link for a given user id. Caller must have already checked auth and links.create permission.
 * Used by the server action createLink and by the POST /api/links handler (Bearer auth).
 */
export async function createLinkWithUserId(
  userId: string,
  input: LinkInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const parsed = createLinkSchema.safeParse({
      url: input.url,
      title: input.title,
      description: input.description,
      favicon: input.favicon,
      linkType: input.linkType,
      tags: input.tags ?? [],
      notes: input.notes,
      isFavorite: input.isFavorite,
      rating: input.rating,
      collectionIds: input.collectionIds ?? [],
      extractMetadata: input.extractMetadata,
      allowDuplicates: input.allowDuplicates,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return {
        success: false,
        error: flat.formErrors[0] ?? "Validation failed",
        fieldErrors: flat.fieldErrors as Record<string, string[]>,
      };
    }
    const validated = parsed.data;

    // Format URL (add protocol if missing)
    const formattedUrl = formatLinkUrl(validated.url);
    const normalized = normalizeUrl(formattedUrl);

    if (!validateUrl(formattedUrl)) {
      return {
        success: false,
        error: "Invalid URL format",
        fieldErrors: { url: ["Please enter a valid URL"] },
      };
    }

    // Check for duplicates (unless explicitly allowed)
    if (!validated.allowDuplicates) {
      const { exactDuplicateIds, similarLinkIds } = await checkDuplicateUrl(formattedUrl, userId);

      // Block on exact duplicates, but still include information about similar URLs
      if (exactDuplicateIds.length > 0) {
        return {
          success: false,
          error: "A link with this exact URL already exists",
          duplicateLinkIds: exactDuplicateIds,
          similarLinkIds,
        };
      }
    }

    // Extract metadata if requested or if title/description missing
    let metadata = null;
    let metadataExtractedAt = null;
    let title = validated.title?.trim() || "";
    let description = validated.description?.trim() || "";
    // Prefer client-provided favicon (e.g. from iOS app metadata fetch); never overwrite it with extracted metadata.
    let favicon = validated.favicon?.trim() || undefined;
    const clientProvidedFavicon = !!favicon;

    if (validated.extractMetadata || !title || !description) {
      try {
        const extracted = await extractLinkMetadata(formattedUrl);
        if (extracted) {
          metadata = extracted;
          metadataExtractedAt = new Date();
          if (!title && extracted.title) {
            title = extracted.title;
          }
          if (!description && extracted.description) {
            description = extracted.description;
          }
          // Only use extracted favicon when the client did not send one (e.g. iOS sends favicon from its metadata call).
          if (!favicon && extracted.favicon) {
            favicon = extracted.favicon;
          }
        }
      } catch (error) {
        // Metadata extraction failed, but don't block link creation
        logger.error("Metadata extraction failed:", error);
      }
    }

    // Use URL as title fallback
    if (!title) {
      try {
        const urlObj = new URL(formattedUrl);
        title = urlObj.hostname.replace(/^www\./, "");
      } catch {
        title = formattedUrl;
      }
    }

    // Auto-detect link type if not provided
    const linkType = validated.linkType || getLinkTypeFromUrl(formattedUrl);

    // Get favicon if not provided (client did not send one)
    if (!favicon) {
      favicon = getFaviconUrl(formattedUrl);
    }

    // Cache favicon locally so we don't have to rely on the remote site on every render.
    // When the client (e.g. iOS app) sent a favicon, we cache it and persist the local path.
    if (favicon) {
      try {
        const cacheOptions = clientProvidedFavicon ? { timeoutMs: 10000 } : undefined;
        let cachedFavicon = await cacheFavicon(favicon, cacheOptions);

        // If caching failed (e.g. data: URL or fetch failed), and this wasn't already a local path,
        // try fallback favicon from the link URL and cache that.
        if (!cachedFavicon && !favicon.startsWith("/uploads/")) {
          const fallbackFavicon = getFaviconUrl(formattedUrl);
          if (fallbackFavicon) {
            cachedFavicon = await cacheFavicon(fallbackFavicon);
          }
        }

        if (cachedFavicon) {
          favicon = cachedFavicon;
        }
      } catch (error) {
        // Favicon caching should never block link creation
        logger.error("Favicon caching failed:", error);
      }
    }

    // Validate rating
    let rating: number | null | undefined = validated.rating;
    if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
      rating = null;
    }

    // Create link
    const link = await prisma.link.create({
      data: {
        title,
        url: formattedUrl,
        normalizedUrl: normalized,
        description: description || null,
        favicon: favicon || null,
        linkType,
        tags: validated.tags || [],
        notes: validated.notes?.trim() || null,
        isFavorite: validated.isFavorite ?? false,
        rating: rating ?? null,
        metadata: metadata ? (metadata as any) : null,
        metadataExtractedAt,
        userId,
      },
    });

    // Add to collections if specified
    if (validated.collectionIds && validated.collectionIds.length > 0) {
      // Verify user has access to these collections
      const collections = await prisma.collection.findMany({
        where: {
          id: { in: validated.collectionIds },
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId,
                  role: { in: ["VIEWER", "EDITOR"] },
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      if (collections.length > 0) {
        await prisma.linkCollection.createMany({
          data: collections.map((collection) => ({
            linkId: link.id,
            collectionId: collection.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    auditLog({
      action: "links.create",
      userId,
      resourceType: "link",
      resourceId: link.id,
    });
    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { id: link.id },
    };
  } catch (error) {
    logger.error("Error creating link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create link",
    };
  }
}

/**
 * Create a new link (server action; uses requireAuth).
 */
export async function createLink(input: LinkInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireAuth();
  await requireAnyPermission("links.create");
  return createLinkWithUserId(user.id, input);
}

export type BulkCreateLinksOptions = {
  collectionIds?: string[];
  extractMetadata?: boolean;
};

export type BulkCreateLinksResult = {
  created: number;
  failed: Array<{ url: string; error: string }>;
};

/**
 * Create multiple links from a list of URLs.
 * Validates each URL and calls createLink; returns count and per-URL errors.
 */
export async function bulkCreateLinks(
  urls: string[],
  options: BulkCreateLinksOptions = {}
): Promise<ActionResult<BulkCreateLinksResult>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    await requireAuth();
    await requireAnyPermission("links.create");

    const parsed = urls
      .map((u) => u.trim())
      .filter(Boolean);
    const failed: Array<{ url: string; error: string }> = [];
    let created = 0;

    for (const url of parsed) {
      const formattedUrl = formatLinkUrl(url);
      if (!validateUrl(formattedUrl)) {
        failed.push({ url: formattedUrl, error: "Invalid URL format" });
        continue;
      }
      const result = await createLink({
        url: formattedUrl,
        collectionIds: options.collectionIds,
        extractMetadata: options.extractMetadata ?? true,
        allowDuplicates: false,
      });
      if (result.success && result.data) {
        created++;
      } else {
        failed.push({
          url: formattedUrl,
          error: !result.success ? result.error : "Failed to create link",
        });
      }
    }

    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { created, failed },
    };
  } catch (error) {
    logger.error("Error bulk creating links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to bulk create links",
    };
  }
}

/**
 * Update an existing link
 */
export async function updateLink(
  id: string,
  input: LinkUpdateInput
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAuth();
  await requireAnyPermission("links.update");
  return updateLinkWithUserId(user.id, id, input);
}

/**
 * Update an existing link with an explicit userId (for Bearer-token API handlers).
 */
export async function updateLinkWithUserId(
  userId: string,
  id: string,
  input: LinkUpdateInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    // Get existing link and its collections (for collection-owner check)
    const existingLink = await prisma.link.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        url: true,
        collections: {
          select: { collection: { select: { ownerId: true } } },
        },
      },
    });

    if (!existingLink) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    const isCollectionOwner = existingLink.collections.some(
      (lc) => lc.collection.ownerId === userId
    );
    if (existingLink.userId !== userId && !isCollectionOwner) {
      return {
        success: false,
        error: "You don't have permission to update this link",
      };
    }

    const parsed = updateLinkSchema.safeParse(input);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return {
        success: false,
        error: flat.formErrors[0] ?? "Validation failed",
        fieldErrors: flat.fieldErrors as Record<string, string[]>,
      };
    }
    const validated = parsed.data;

    // If URL changed, validate and check for duplicates
    let formattedUrl = existingLink.url;
    if (validated.url && validated.url !== existingLink.url) {
      formattedUrl = formatLinkUrl(validated.url);
      if (!validateUrl(formattedUrl)) {
        return {
          success: false,
          error: "Invalid URL format",
          fieldErrors: { url: ["Please enter a valid URL"] },
        };
      }

      // Only block on exact duplicates when updating; similar links will be
      // surfaced as a warning in the client UI.
      const { exactDuplicateIds, similarLinkIds } = await checkDuplicateUrl(formattedUrl, userId, id);
      if (exactDuplicateIds.length > 0) {
        return {
          success: false,
          error: "A link with this exact URL already exists",
          duplicateLinkIds: exactDuplicateIds,
          similarLinkIds,
        };
      }
    }

    // Extract metadata if URL changed or refresh requested
    let metadata = null;
    let metadataExtractedAt = null;
    let title = validated.title?.trim();
    let description = validated.description?.trim();
    let favicon = validated.favicon;

    if (validated.extractMetadata || (validated.url && validated.url !== existingLink.url)) {
      try {
        const extracted = await extractLinkMetadata(formattedUrl);
        if (extracted) {
          metadata = extracted;
          metadataExtractedAt = new Date();
          if (!title && extracted.title) {
            title = extracted.title;
          }
          if (!description && extracted.description) {
            description = extracted.description;
          }
          if (!favicon && extracted.favicon) {
            favicon = extracted.favicon;
          }
        }
      } catch (error) {
        logger.error("Metadata extraction failed:", error);
      }
    }

    // If we still don't have a favicon, fall back to the generic helper
    if (!favicon && formattedUrl) {
      favicon = getFaviconUrl(formattedUrl);
    }

    // Cache favicon locally so we can serve it from our own domain
    // and avoid re-fetching it from the original site.
    if (favicon) {
      try {
        let cachedFavicon = await cacheFavicon(favicon);

        if (!cachedFavicon && !favicon.startsWith("/uploads/") && formattedUrl) {
          const fallbackFavicon = getFaviconUrl(formattedUrl);
          if (fallbackFavicon) {
            cachedFavicon = await cacheFavicon(fallbackFavicon);
          }
        }

        if (cachedFavicon) {
          favicon = cachedFavicon;
        }
      } catch (error) {
        logger.error("Favicon caching failed:", error);
      }
    }

    // Validate rating
    let rating: number | null | undefined = validated.rating;
    if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
      rating = null;
    }

    // Update link
    const updateData: Prisma.LinkUpdateInput = {};
    if (validated.url !== undefined) {
      updateData.url = formattedUrl;
      updateData.normalizedUrl = normalizeUrl(formattedUrl);
    }
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (validated.favicon !== undefined || favicon) updateData.favicon = favicon || null;
    if (validated.linkType !== undefined) updateData.linkType = validated.linkType;
    if (validated.tags !== undefined) updateData.tags = validated.tags;
    if (validated.notes !== undefined) updateData.notes = validated.notes?.trim() || null;
    if (validated.isFavorite !== undefined) updateData.isFavorite = validated.isFavorite;
    if (validated.rating !== undefined) updateData.rating = rating ?? null;
    if (validated.archivedAt !== undefined) updateData.archivedAt = validated.archivedAt;
    if (metadata) {
      updateData.metadata = metadata as Prisma.InputJsonValue;
      updateData.metadataExtractedAt = metadataExtractedAt;
    }

    await prisma.link.update({
      where: { id },
      data: updateData,
    });

    // Update collections if specified
    if (validated.collectionIds !== undefined) {
      // Remove all existing collection associations
      await prisma.linkCollection.deleteMany({
        where: { linkId: id },
      });

      // Add new collections
      if (validated.collectionIds.length > 0) {
        const collections = await prisma.collection.findMany({
          where: {
            id: { in: validated.collectionIds },
            OR: [
              { ownerId: userId },
              {
                members: {
                  some: {
                    userId: userId,
                    role: { in: ["VIEWER", "EDITOR"] },
                  },
                },
              },
            ],
          },
          select: { id: true },
        });

        if (collections.length > 0) {
          await prisma.linkCollection.createMany({
            data: collections.map((collection) => ({
              linkId: id,
              collectionId: collection.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    revalidatePath("/dashboard/links");
    auditLog({
      action: "links.update",
      userId: userId,
      resourceType: "link",
      resourceId: id,
    });
    revalidatePath(`/dashboard/links/${id}`);
    return {
      success: true,
      data: { id },
    };
  } catch (error) {
    logger.error("Error updating link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update link",
    };
  }
}

/**
 * Delete a link
 */
export async function deleteLink(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.delete");

    const link = await prisma.link.findUnique({
      where: { id },
      select: {
        userId: true,
        collections: {
          select: { collection: { select: { ownerId: true } } },
        },
      },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    const isCollectionOwner = link.collections.some(
      (lc) => lc.collection.ownerId === user.id
    );
    if (link.userId !== user.id && !isCollectionOwner) {
      return {
        success: false,
        error: "You don't have permission to delete this link",
      };
    }

    await prisma.link.delete({
      where: { id },
    });

    auditLog({
      action: "links.delete",
      userId: user.id,
      resourceType: "link",
      resourceId: id,
    });
    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error deleting link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete link",
    };
  }
}

/**
 * Delete a link with an explicit userId (for Bearer-token API handlers, e.g. iOS app).
 */
export async function deleteLinkWithUserId(userId: string, id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const canDelete = await hasAnyPermission(userId, ["links.delete"]);
    if (!canDelete) {
      return { success: false, error: "You do not have permission to delete links" };
    }

    const link = await prisma.link.findUnique({
      where: { id },
      select: {
        userId: true,
        collections: {
          select: { collection: { select: { ownerId: true } } },
        },
      },
    });

    if (!link) {
      return { success: false, error: "Link not found" };
    }

    const isCollectionOwner = link.collections.some(
      (lc) => lc.collection.ownerId === userId
    );
    if (link.userId !== userId && !isCollectionOwner) {
      return {
        success: false,
        error: "You don't have permission to delete this link",
      };
    }

    await prisma.link.delete({ where: { id } });

    auditLog({
      action: "links.delete",
      userId,
      resourceType: "link",
      resourceId: id,
    });
    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error deleting link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete link",
    };
  }
}

/**
 * Archive a link
 */
export async function archiveLink(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.archive", "links.update");

    const link = await prisma.link.findUnique({
      where: { id },
      select: {
        userId: true,
        collections: {
          select: { collection: { select: { ownerId: true } } },
        },
      },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    const isCollectionOwner = link.collections.some(
      (lc) => lc.collection.ownerId === user.id
    );
    if (link.userId !== user.id && !isCollectionOwner) {
      return {
        success: false,
        error: "You don't have permission to archive this link",
      };
    }

    await prisma.link.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/dashboard/links");
    auditLog({
      action: "links.archive",
      userId: user.id,
      resourceType: "link",
      resourceId: id,
    });
    revalidatePath("/dashboard/links/archive");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error archiving link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive link",
    };
  }
}

/**
 * Unarchive a link
 */
export async function unarchiveLink(id: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.archive", "links.update");

    const link = await prisma.link.findUnique({
      where: { id },
      select: {
        userId: true,
        collections: {
          select: { collection: { select: { ownerId: true } } },
        },
      },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    const isCollectionOwner = link.collections.some(
      (lc) => lc.collection.ownerId === user.id
    );
    if (link.userId !== user.id && !isCollectionOwner) {
      return {
        success: false,
        error: "You don't have permission to unarchive this link",
      };
    }

    await prisma.link.update({
      where: { id },
      data: { archivedAt: null },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/links/archive");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error unarchiving link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unarchive link",
    };
  }
}

/**
 * Bulk unarchive links
 */
export async function bulkUnarchiveLinks(
  linkIds: string[]
): Promise<ActionResult<{ unarchived: number; failed: number }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.archive", "links.update");

    if (!linkIds || linkIds.length === 0) {
      return { success: false, error: "No links selected" };
    }

    // Verify ownership
    const links = await prisma.link.findMany({
      where: {
        id: { in: linkIds },
        userId: user.id,
      },
      select: { id: true },
    });

    if (links.length !== linkIds.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission to unarchive them",
      };
    }

    const result = await prisma.link.updateMany({
      where: {
        id: { in: linkIds },
        userId: user.id,
      },
      data: { archivedAt: null },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/links/archive");
    revalidatePath("/dashboard/archive");

    return {
      success: true,
      data: {
        unarchived: result.count,
        failed: linkIds.length - result.count,
      },
      message: `Successfully unarchived ${result.count} link${result.count !== 1 ? "s" : ""}`,
    };
  } catch (error) {
    logger.error("Bulk unarchive links error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unarchive links",
    };
  }
}

/**
 * Get links with filtering
 */
export async function getLinks(filters: LinkFilters = {}): Promise<GetLinksResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { links: [], total: 0, page: 1, limit: 50, totalPages: 0 };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    const userPermissions = await getUserPermissions(user.id);
    const canViewAllLinks = userPermissions.has("links.view_all");

    const where: Prisma.LinkWhereInput = {};

    const isSharedWithMe =
      filters.sharedWithMe || filters.collectionId === SHARED_WITH_ME_COLLECTION_ID;
    const filteringByCollection = Boolean(
      filters.collectionId && filters.collectionId !== SHARED_WITH_ME_COLLECTION_ID
    );

    // User filter: default to current user unless viewing shared collection, shared-with-me, or explicit userId (requires links.view_all)
    if (filters.userId && (filters.userId === user.id || canViewAllLinks)) {
      where.userId = filters.userId;
    } else if (!isSharedWithMe && !filteringByCollection) {
      where.userId = user.id;
    }

    // Shared with me: links shared directly with current user (via LinkShare)
    if (isSharedWithMe) {
      where.sharedWith = {
        some: {
          sharedWithUserId: user.id,
        },
      };
    }

    // Archive filter
    if (filters.archived === true) {
      // Show only archived links (archivedAt is not null)
      where.archivedAt = { not: null };
    } else if (filters.archived === false) {
      // Show only non-archived links (archivedAt is null)
      where.archivedAt = null;
    }
    // If archived is undefined, don't filter by archive status (show all)

    // Link type filter
    if (filters.linkType) {
      where.linkType = filters.linkType;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasEvery: filters.tags };
    }

    // Collection filter (skip when showing Shared with me)
    if (filteringByCollection && filters.collectionId) {
      where.collections = {
        some: {
          collectionId: filters.collectionId,
          collection: {
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
        },
      };
    }

    // Favorite filter
    if (filters.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }

    // Rating filter
    if (filters.minRating !== undefined) {
      where.rating = { gte: filters.minRating };
    }

    // Sort and pagination (allowed: 10, 25, 50, 100, or LINK_PAGE_SIZE_ALL for "all")
    const sortBy = filters.sortBy || "createdAt";
    const sortOrder = filters.sortOrder || "desc";
    const page = Math.max(1, filters.page ?? 1);
    const validLimits = [...LINK_PAGE_SIZE_OPTIONS, LINK_PAGE_SIZE_ALL];
    const requestedLimit = filters.limit ?? DEFAULT_LINKS_PAGE_SIZE;
    const limit = validLimits.includes(requestedLimit)
      ? requestedLimit
      : DEFAULT_LINKS_PAGE_SIZE;
    const skip = (page - 1) * limit;

    const ownLinksOnly = !isSharedWithMe && !filteringByCollection;
    let useRankedSearch =
      Boolean(filters.search?.trim()) &&
      ownLinksOnly &&
      ["createdAt", "updatedAt", "title", "rating"].includes(sortBy) &&
      ["asc", "desc"].includes(sortOrder);

    let total = 0;
    type LinkRow = GetLinksResult["links"][number];
    let links: LinkRow[] = [];

    if (useRankedSearch) {
      // Relevance ranking: all fields (title, description, url, notes, tags, metadata) contribute to score
      const searchTerm = filters.search!.trim();
      const escaped = searchTerm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;
      const sortColumn = { createdAt: '"createdAt"', updatedAt: '"updatedAt"', title: '"title"', rating: '"rating"' }[sortBy];
      const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
      const archivedCond =
        filters.archived === false
          ? PrismaRuntime.sql`AND "archivedAt" IS NULL`
          : filters.archived === true
            ? PrismaRuntime.sql`AND "archivedAt" IS NOT NULL`
            : PrismaRuntime.empty;
      try {
        const [rankedRows, countRows] = await Promise.all([
          prisma.$queryRaw<Array<{ id: string }>>(
            PrismaRuntime.sql`
            SELECT id FROM (
              SELECT id,
                (CASE WHEN title ILIKE ${pattern} THEN 4 ELSE 0 END) +
                (CASE WHEN description ILIKE ${pattern} THEN 3 ELSE 0 END) +
                (CASE WHEN url ILIKE ${pattern} THEN 3 ELSE 0 END) +
                (CASE WHEN notes ILIKE ${pattern} THEN 2 ELSE 0 END) +
                (CASE WHEN ${searchTerm} = ANY(tags) THEN 3 ELSE 0 END) +
                (CASE WHEN metadata IS NOT NULL AND metadata::text ILIKE ${pattern} THEN 2 ELSE 0 END)
                AS score,
                "createdAt", "updatedAt", "title", "rating"
              FROM links
              WHERE "userId" = ${user.id}
                AND (
                  title ILIKE ${pattern}
                  OR description ILIKE ${pattern}
                  OR url ILIKE ${pattern}
                  OR notes ILIKE ${pattern}
                  OR ${searchTerm} = ANY(tags)
                  OR (metadata IS NOT NULL AND metadata::text ILIKE ${pattern})
                )
              ${archivedCond}
            ) ranked
            ORDER BY score DESC, ${PrismaRuntime.raw(sortColumn + " " + orderDir)}
            LIMIT ${limit}
            OFFSET ${skip}
            `
          ),
          prisma.$queryRaw<Array<{ count: bigint }>>(
            PrismaRuntime.sql`
            SELECT COUNT(*)::int AS count FROM links
            WHERE "userId" = ${user.id}
              AND (
                title ILIKE ${pattern}
                OR description ILIKE ${pattern}
                OR url ILIKE ${pattern}
                OR notes ILIKE ${pattern}
                OR ${searchTerm} = ANY(tags)
                OR (metadata IS NOT NULL AND metadata::text ILIKE ${pattern})
              )
            ${archivedCond}
            `
          ),
        ]);
        const ids = rankedRows.map((r) => r.id);
        total = Number(countRows[0]?.count ?? 0);
        if (ids.length === 0) {
          links = [];
        } else {
          const linkMap = new Map(
            (
              await prisma.link.findMany({
                where: { id: { in: ids } },
                select: {
                  id: true,
                  title: true,
                  url: true,
                  description: true,
                  favicon: true,
                  linkType: true,
                  tags: true,
                  notes: true,
                  isFavorite: true,
                  rating: true,
                  userId: true,
                  createdAt: true,
                  updatedAt: true,
                  collections: {
                    select: {
                      collection: {
                        select: { id: true, name: true, color: true },
                      },
                    },
                  },
                },
              })
            ).map((l) => [l.id, l] as const)
          );
          links = ids.map((id) => linkMap.get(id)!).filter(Boolean);
        }
      } catch {
        // Fallback to non-ranked path on error (e.g. non-PostgreSQL)
        useRankedSearch = false;
      }
    }

    if (!useRankedSearch) {
      // Search filter (title, description, url, notes, tags, and metadata JSON text)
      if (filters.search) {
        const searchTerm = filters.search.trim();
        const orConditions: Prisma.LinkWhereInput[] = [
          { title: { contains: searchTerm, mode: "insensitive" } },
          { description: { contains: searchTerm, mode: "insensitive" } },
          { url: { contains: searchTerm, mode: "insensitive" } },
          { notes: { contains: searchTerm, mode: "insensitive" } },
          { tags: { hasSome: [searchTerm] } },
        ];
        if (ownLinksOnly) {
          try {
            const escaped = searchTerm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
            const pattern = `%${escaped}%`;
            const metadataIds =
              filters.archived === false
                ? await prisma.$queryRaw<Array<{ id: string }>>`
                    SELECT id FROM links
                    WHERE metadata IS NOT NULL
                      AND metadata::text ILIKE ${pattern}
                      AND "userId" = ${user.id}
                      AND "archivedAt" IS NULL
                  `
                : filters.archived === true
                  ? await prisma.$queryRaw<Array<{ id: string }>>`
                      SELECT id FROM links
                      WHERE metadata IS NOT NULL
                        AND metadata::text ILIKE ${pattern}
                        AND "userId" = ${user.id}
                        AND "archivedAt" IS NOT NULL
                    `
                  : await prisma.$queryRaw<Array<{ id: string }>>`
                      SELECT id FROM links
                      WHERE metadata IS NOT NULL
                        AND metadata::text ILIKE ${pattern}
                        AND "userId" = ${user.id}
                    `;
            const ids = metadataIds.map((row) => row.id);
            if (ids.length > 0) {
              orConditions.push({ id: { in: ids } });
            }
          } catch {
            // skip metadata search
          }
        }
        where.OR = orConditions;
      }

      const [linksResult, totalResult] = await Promise.all([
        prisma.link.findMany({
          where,
          select: {
            id: true,
            title: true,
            url: true,
            description: true,
            favicon: true,
            linkType: true,
            tags: true,
            notes: true,
            isFavorite: true,
            rating: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            collections: {
              select: {
                collection: {
                  select: { id: true, name: true, color: true },
                },
              },
            },
          },
          orderBy: {
            [sortBy]: sortOrder,
          },
          skip,
          take: limit,
        }),
        prisma.link.count({ where }),
      ]);
      links = linksResult;
      total = totalResult;
    }

    const totalPages = Math.ceil(total / limit);
    return {
      links: links.map((link) => ({
        ...link,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  } catch (error) {
    const err =
      error instanceof Error
        ? error
        : new Error(error != null ? String(error) : "Error fetching links (unknown/falsy throw)");
    logger.error("Error fetching links", err, {
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
    });
    return { links: [], total: 0, page: 1, limit: 50, totalPages: 0 };
  }
}

export type ExportLinksOptions = {
  format: "json" | "csv";
  collectionId?: string;
  archived?: boolean;
  /** When false, collections are omitted from the export. Default true. */
  includeCollections?: boolean;
};

export type ExportLinksResult = {
  content: string;
  filename: string;
  mimeType: string;
};

/**
 * Export links as JSON or CSV for download.
 * Uses getLinks with high limit to fetch all matching links.
 */
export async function exportLinks(
  options: ExportLinksOptions
): Promise<ActionResult<ExportLinksResult>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    await requireAuth();
    await requireAnyPermission("links.export", "links.view");

    const result = await getLinks({
      collectionId: options.collectionId,
      archived: options.archived ?? false,
      page: 1,
      limit: 10000,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    const links = result.links;
    const timestamp = new Date().toISOString().slice(0, 10);
    const includeCollections = options.includeCollections !== false;

    if (options.format === "json") {
      // Omit link id and collection ids so the file is portable across users (import uses only name/color).
      const payload = links.map((link) => ({
        title: link.title,
        url: link.url,
        description: link.description,
        linkType: link.linkType,
        tags: link.tags,
        notes: link.notes,
        isFavorite: link.isFavorite,
        rating: link.rating,
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
        ...(includeCollections && {
          collections: link.collections.map((lc) => ({
            name: lc.collection.name,
            color: lc.collection.color,
          })),
        }),
      }));
      return {
        success: true,
        data: {
          content: JSON.stringify(payload, null, 2),
          filename: `links-export-${timestamp}.json`,
          mimeType: "application/json",
        },
      };
    }

    // CSV: escape commas and newlines
    const escapeCsv = (val: string | null | undefined): string => {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const headers = [
      "title",
      "url",
      "description",
      "linkType",
      "tags",
      "notes",
      "isFavorite",
      "rating",
      "createdAt",
      "updatedAt",
      ...(includeCollections ? ["collectionNames"] : []),
    ];
    const rows = links.map((link) => [
      link.title,
      link.url,
      link.description ?? "",
      link.linkType,
      link.tags.join("; "),
      link.notes ?? "",
      link.isFavorite ? "true" : "false",
      link.rating ?? "",
      link.createdAt.toISOString(),
      link.updatedAt.toISOString(),
      ...(includeCollections ? [link.collections.map((lc) => lc.collection.name).join("; ")] : []),
    ]);
    const csvLines = [headers.join(","), ...rows.map((row) => row.map((v) => escapeCsv(String(v))).join(","))];
    const content = csvLines.join("\n");
    const bom = "\uFEFF";
    return {
      success: true,
      data: {
        content: bom + content,
        filename: `links-export-${timestamp}.csv`,
        mimeType: "text/csv;charset=utf-8",
      },
    };
  } catch (error) {
    logger.error("Error exporting links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export links",
    };
  }
}

export type ExportSelectedLinksOptions = {
  /** When false, collections are omitted from the export. Default true. */
  includeCollections?: boolean;
};

/**
 * Export specific selected links by ID as JSON or CSV for download.
 * Enables bulk-select-then-export workflow and cross-user data transfer.
 */
export async function exportSelectedLinks(
  linkIds: string[],
  format: "json" | "csv",
  options: ExportSelectedLinksOptions = {}
): Promise<ActionResult<ExportLinksResult>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.export", "links.view");

    if (!linkIds || linkIds.length === 0) {
      return { success: false, error: "No links selected" };
    }

    const includeCollections = options.includeCollections !== false;

    // Fetch the selected links (only ones the user owns)
    const links = await prisma.link.findMany({
      where: {
        id: { in: linkIds },
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
        url: true,
        description: true,
        linkType: true,
        tags: true,
        notes: true,
        isFavorite: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
        collections: {
          select: {
            collection: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (links.length === 0) {
      return { success: false, error: "No accessible links found for the given IDs" };
    }

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const payload = links.map((link) => ({
        title: link.title,
        url: link.url,
        description: link.description,
        linkType: link.linkType,
        tags: link.tags,
        notes: link.notes,
        isFavorite: link.isFavorite,
        rating: link.rating,
        createdAt: link.createdAt.toISOString(),
        updatedAt: link.updatedAt.toISOString(),
        ...(includeCollections && {
          collections: link.collections.map((lc) => ({
            name: lc.collection.name,
            color: lc.collection.color,
          })),
        }),
      }));
      return {
        success: true,
        data: {
          content: JSON.stringify(payload, null, 2),
          filename: `links-selected-${timestamp}.json`,
          mimeType: "application/json",
        },
      };
    }

    // CSV format
    const escapeCsv = (val: string | null | undefined): string => {
      if (val == null) return "";
      const s = String(val);
      if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const headers = [
      "title",
      "url",
      "description",
      "linkType",
      "tags",
      "notes",
      "isFavorite",
      "rating",
      "createdAt",
      "updatedAt",
      ...(includeCollections ? ["collectionNames"] : []),
    ];
    const rows = links.map((link) => [
      link.title,
      link.url,
      link.description ?? "",
      link.linkType,
      link.tags.join("; "),
      link.notes ?? "",
      link.isFavorite ? "true" : "false",
      link.rating ?? "",
      link.createdAt.toISOString(),
      link.updatedAt.toISOString(),
      ...(includeCollections ? [link.collections.map((lc) => lc.collection.name).join("; ")] : []),
    ]);
    const csvLines = [headers.join(","), ...rows.map((row) => row.map((v) => escapeCsv(String(v))).join(","))];
    const content = csvLines.join("\n");
    const bom = "\uFEFF";
    return {
      success: true,
      data: {
        content: bom + content,
        filename: `links-selected-${timestamp}.csv`,
        mimeType: "text/csv;charset=utf-8",
      },
    };
  } catch (error) {
    logger.error("Error exporting selected links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export selected links",
    };
  }
}

export type ImportLinksOptions = {
  format: "json" | "csv";
  collectionId?: string;
  skipDuplicates?: boolean;
  /** Map source collection name → target collection ID. null = skip that collection. Missing key = auto-create/match. */
  collectionMapping?: Record<string, string | null>;
  /** 0-based row indices to import. When provided, rows not listed are skipped. */
  rowIndicesToImport?: number[];
};

export type ImportLinksResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; url?: string; error: string }>;
};

// ── Import preview types & action ──────────────────────────────────────

export type ImportPreviewLink = {
  rowIndex: number;
  url: string;
  title: string;
  collections: Array<{ name: string; color?: string | null }>;
  isDuplicate: boolean;
  validationError: string | null;
};

export type ImportPreviewResult = {
  links: ImportPreviewLink[];
  sourceCollectionNames: Array<{ name: string; color?: string | null }>;
  totalCount: number;
  duplicateCount: number;
  errorCount: number;
  newCount: number;
};

/**
 * Helper: parse import file content into raw row objects.
 * Shared between previewImportLinks and importLinks.
 */
function parseImportContent(
  content: string,
  format: "json" | "csv"
): { rows: Array<Record<string, unknown>>; error?: string } {
  if (format === "json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) {
        return { rows: parsed };
      } else if (
        parsed &&
        typeof parsed === "object" &&
        "links" in parsed &&
        Array.isArray((parsed as { links: unknown }).links)
      ) {
        return { rows: (parsed as { links: Array<Record<string, unknown>> }).links };
      } else if (parsed && typeof parsed === "object") {
        return { rows: [parsed as Record<string, unknown>] };
      } else {
        return { rows: [], error: "Invalid JSON. Expected an array of link objects or { links: [...] }." };
      }
    } catch {
      return { rows: [], error: "Invalid JSON. Expected an array of link objects." };
    }
  }

  // CSV
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], error: "CSV must have a header row and at least one data row." };
  }
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        let field = "";
        while (i < line.length) {
          if (line[i] === '"') {
            i++;
            if (line[i] === '"') {
              field += '"';
              i++;
            } else break;
          } else {
            field += line[i++];
          }
        }
        result.push(field);
        if (line[i] === ",") i++;
      } else {
        const end = line.indexOf(",", i);
        const field = end === -1 ? line.slice(i) : line.slice(i, end);
        result.push(field.replace(/""/g, '"'));
        i = end === -1 ? line.length : end + 1;
      }
    }
    return result;
  };

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    header.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });

    // Map CSV collectionNames to collections array
    if (typeof row.collectionNames === "string" && (row.collectionNames as string).trim() && !row.collections) {
      const names = (row.collectionNames as string).split(";").map((n) => n.trim()).filter(Boolean);
      if (names.length > 0) {
        row.collections = names.map((name) => ({ name }));
      }
    }

    // Convert CSV isFavorite string to boolean
    if (typeof row.isFavorite === "string") {
      row.isFavorite = (row.isFavorite as string).toLowerCase() === "true";
    }

    // Convert CSV rating string to number
    if (typeof row.rating === "string" && (row.rating as string).trim()) {
      const p = parseInt(row.rating as string, 10);
      row.rating = Number.isNaN(p) ? undefined : p;
    } else if (typeof row.rating === "string" && !(row.rating as string).trim()) {
      row.rating = undefined;
    }

    rows.push(row);
  }
  return { rows };
}

/**
 * Preview an import file: parse, validate, check duplicates, and return
 * a summary so the user can review before confirming the import.
 */
export async function previewImportLinks(
  content: string,
  format: "json" | "csv"
): Promise<ActionResult<ImportPreviewResult>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.import", "links.create");

    const { rows, error: parseError } = parseImportContent(content, format);
    if (parseError) {
      return { success: false, error: parseError };
    }
    if (rows.length === 0) {
      return { success: false, error: "No links found in the file." };
    }

    // Validate all rows first to gather URLs for batch duplicate check
    const validatedRows: Array<{
      rowIndex: number;
      url: string;
      title: string;
      collections: Array<{ name: string; color?: string | null }>;
      validationError: string | null;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = importLinkRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        validatedRows.push({
          rowIndex: i,
          url: typeof rows[i]?.url === "string" ? (rows[i].url as string) : "",
          title: typeof rows[i]?.title === "string" ? (rows[i].title as string) : "",
          collections: [],
          validationError: parsed.error.errors.map((e) => e.message).join("; "),
        });
      } else {
        const row = parsed.data;
        const formattedUrl = formatLinkUrl(row.url);
        validatedRows.push({
          rowIndex: i,
          url: formattedUrl,
          title: row.title || formattedUrl,
          collections: (row.collections ?? []).map((c) => ({ name: c.name, color: c.color })),
          validationError: null,
        });
      }
    }

    // Batch duplicate check for all valid URLs
    const validUrls = validatedRows.filter((r) => !r.validationError).map((r) => r.url);
    const existingLinks = validUrls.length > 0
      ? await prisma.link.findMany({
          where: { userId: user.id, url: { in: validUrls } },
          select: { url: true },
        })
      : [];
    const existingUrlSet = new Set(existingLinks.map((l) => l.url));

    // Build preview links
    const previewLinks: ImportPreviewLink[] = validatedRows.map((r) => ({
      rowIndex: r.rowIndex,
      url: r.url,
      title: r.title,
      collections: r.collections,
      isDuplicate: !r.validationError && existingUrlSet.has(r.url),
      validationError: r.validationError,
    }));

    // Collect unique source collection names
    const collNameMap = new Map<string, { name: string; color?: string | null }>();
    for (const link of previewLinks) {
      for (const c of link.collections) {
        const key = c.name.trim().toLowerCase();
        if (key && !collNameMap.has(key)) {
          collNameMap.set(key, { name: c.name.trim(), color: c.color });
        }
      }
    }

    const errorCount = previewLinks.filter((l) => l.validationError).length;
    const duplicateCount = previewLinks.filter((l) => l.isDuplicate).length;
    const newCount = previewLinks.length - errorCount - duplicateCount;

    return {
      success: true,
      data: {
        links: previewLinks,
        sourceCollectionNames: Array.from(collNameMap.values()),
        totalCount: previewLinks.length,
        duplicateCount,
        errorCount,
        newCount,
      },
    };
  } catch (error) {
    logger.error("Error previewing import:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to preview import",
    };
  }
}

/**
 * Import links from JSON or CSV content.
 * Supports optional collectionMapping (source name → target ID or null to skip)
 * and rowIndicesToImport (0-based indices to cherry-pick specific rows).
 */
export async function importLinks(
  content: string,
  options: ImportLinksOptions
): Promise<ActionResult<ImportLinksResult>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.import", "links.create");

    const { rows, error: parseError } = parseImportContent(content, options.format);
    if (parseError) {
      return { success: false, error: parseError };
    }

    const skipDuplicates = options.skipDuplicates ?? true;
    const rowFilter = options.rowIndicesToImport
      ? new Set(options.rowIndicesToImport)
      : null;
    const collMapping = options.collectionMapping; // may be undefined
    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; url?: string; error: string }> = [];

    // Cache: normalized collection name -> collection id (for this user)
    const collectionNameToId = new Map<string, string>();

    async function resolveCollectionId(name: string, color?: string | null): Promise<string | null> {
      const normalized = name.trim().toLowerCase();
      if (!normalized) return null;

      // If a mapping is provided, use it
      if (collMapping && normalized in collMapping) {
        const mapped = collMapping[normalized];
        if (mapped === null) return null; // user chose to skip this collection
        return mapped; // user chose a specific target collection ID
      }
      // Also check the non-normalized key (original name)
      if (collMapping) {
        const originalKey = Object.keys(collMapping).find(
          (k) => k.trim().toLowerCase() === normalized
        );
        if (originalKey !== undefined) {
          const mapped = collMapping[originalKey];
          if (mapped === null) return null;
          return mapped;
        }
      }

      // Default: auto-create/match by name
      const cached = collectionNameToId.get(normalized);
      if (cached) return cached;
      const existing = await prisma.collection.findFirst({
        where: { ownerId: user.id, name: { equals: name.trim(), mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        collectionNameToId.set(normalized, existing.id);
        return existing.id;
      }
      const created = await createCollection({
        name: name.trim(),
        color: color && /^#[0-9A-Fa-f]{6}$/.test(color.trim()) ? color.trim() : undefined,
      });
      if (created.success && created.data) {
        collectionNameToId.set(normalized, created.data.id);
        return created.data.id;
      }
      return null;
    }

    for (let i = 0; i < rows.length; i++) {
      // Skip rows not in the allowed set (if a filter was provided)
      if (rowFilter && !rowFilter.has(i)) {
        continue;
      }

      const rowIndex = i + 1;
      const parsed = importLinkRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        const rowUrl = rows[i]?.url;
        errors.push({
          row: rowIndex,
          url: typeof rowUrl === "string" ? rowUrl : undefined,
          error: parsed.error.errors.map((e) => e.message).join("; "),
        });
        continue;
      }
      const row = parsed.data;
      const formattedUrl = formatLinkUrl(row.url);
      if (skipDuplicates) {
        const { exactDuplicateIds } = await checkDuplicateUrl(formattedUrl, user.id);
        if (exactDuplicateIds.length > 0) {
          skipped++;
          continue;
        }
      }

      let collectionIds: string[] | undefined;
      if (row.collections && row.collections.length > 0) {
        const resolved: string[] = [];
        for (const c of row.collections) {
          const id = await resolveCollectionId(c.name, c.color);
          if (id && !resolved.includes(id)) resolved.push(id);
        }
        if (resolved.length > 0) collectionIds = resolved;
      }
      if (options.collectionId) {
        const base = collectionIds ?? [];
        if (!base.includes(options.collectionId)) collectionIds = [...base, options.collectionId];
        else collectionIds = base;
      }

      const result = await createLink({
        url: formattedUrl,
        title: row.title || undefined,
        description: row.description || undefined,
        linkType: row.linkType,
        tags: row.tags,
        notes: row.notes || undefined,
        isFavorite: row.isFavorite,
        rating: row.rating ?? undefined,
        collectionIds,
        extractMetadata: false,
        allowDuplicates: !skipDuplicates,
      });
      if (result.success) {
        imported++;
      } else {
        errors.push({
          row: rowIndex,
          url: formattedUrl,
          error: result.error ?? "Failed to create",
        });
      }
    }

    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { imported, skipped, errors },
    };
  } catch (error) {
    logger.error("Error importing links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to import links",
    };
  }
}

/**
 * Get a single link by ID
 */
export async function getLink(id: string) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return null;
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    const link = await prisma.link.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        url: true,
        description: true,
        favicon: true,
        linkType: true,
        tags: true,
        notes: true,
        isFavorite: true,
        rating: true,
        metadata: true,
        metadataExtractedAt: true,
        userId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                description: true,
                color: true,
                ownerId: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!link) {
      return null;
    }

    // Check access: owner, shared with current user (LinkShare), or in a collection user can access
    if (link.userId !== user.id) {
      const shared = await prisma.linkShare.findUnique({
        where: {
          linkId_sharedWithUserId: { linkId: id, sharedWithUserId: user.id },
        },
      });
      if (shared) return link;

      // Link may be in a shared collection (added by another member). Allow if user is owner or member of any collection containing this link.
      const collectionIds = link.collections.map((lc) => lc.collection.id);
      if (collectionIds.length > 0) {
        const hasCollectionAccess = await prisma.collection.findFirst({
          where: {
            id: { in: collectionIds },
            OR: [
              { ownerId: user.id },
              { members: { some: { userId: user.id } } },
            ],
          },
          select: { id: true },
        });
        if (hasCollectionAccess) return link;
      }

      return null;
    }

    return link;
  } catch (error) {
    logger.error("Error fetching link:", error);
    return null;
  }
}

/**
 * Lightweight existence check for a link ID.
 * Used by UI to distinguish between "not found" and "no permission".
 */
export async function linkExists(id: string): Promise<boolean> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return false;
    }

    const link = await prisma.link.findUnique({
      where: { id },
      select: { id: true },
    });

    return Boolean(link);
  } catch (error) {
    logger.error("Error checking link existence:", error);
    return false;
  }
}

/**
 * Bulk update links
 */
export async function bulkUpdateLinks(
  ids: string[],
  updates: LinkUpdateInput
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
    await requireAnyPermission("links.update");

    // Verify ownership
    const links = await prisma.link.findMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      select: { id: true },
    });

    if (links.length !== ids.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission to update them",
      };
    }

    const updateData: Prisma.LinkUpdateManyMutationInput = {};
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.isFavorite !== undefined) updateData.isFavorite = updates.isFavorite;
    if (updates.rating !== undefined) {
      updateData.rating = updates.rating && updates.rating >= 1 && updates.rating <= 5 ? updates.rating : null;
    }

    await prisma.link.updateMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      data: updateData,
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error bulk updating links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update links",
    };
  }
}

/**
 * Bulk delete links
 */
export async function bulkDeleteLinks(ids: string[]): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.delete");

    // Verify ownership
    const links = await prisma.link.findMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      select: { id: true },
    });

    if (links.length !== ids.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission to delete them",
      };
    }

    await prisma.link.deleteMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/archive");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error bulk deleting links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete links",
    };
  }
}

/**
 * Bulk archive links
 */
export async function bulkArchiveLinks(ids: string[]): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.archive", "links.update");

    // Verify ownership
    const links = await prisma.link.findMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      select: { id: true },
    });

    if (links.length !== ids.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission to archive them",
      };
    }

    await prisma.link.updateMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      data: { archivedAt: new Date() },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/links/archive");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error bulk archiving links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to archive links",
    };
  }
}

/**
 * Add link to collection
 */
export async function addLinkToCollection(
  linkId: string,
  collectionId: string
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
    await requireAnyPermission("links.update");

    // Verify link ownership
    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });

    if (!link || link.userId !== user.id) {
      return {
        success: false,
        error: "Link not found or you don't have permission",
      };
    }

    // Verify collection access (owner or EDITOR can add links; VIEWER cannot)
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
                role: "EDITOR",
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found or you don't have permission to add links to it",
      };
    }

    await prisma.linkCollection.create({
      data: {
        linkId,
        collectionId,
      },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error adding link to collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add link to collection",
    };
  }
}

/**
 * Remove link from collection
 */
export async function removeLinkFromCollection(
  linkId: string,
  collectionId: string
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
    await requireAnyPermission("links.update");

    // Verify link ownership or collection editor access
    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    // Check if user owns link or has editor access to collection
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
                role: "EDITOR",
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!collection && link.userId !== user.id) {
      return {
        success: false,
        error: "You don't have permission to remove this link from the collection",
      };
    }

    await prisma.linkCollection.deleteMany({
      where: {
        linkId,
        collectionId,
      },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error removing link from collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove link from collection",
    };
  }
}

/**
 * Share a single link with another user (link owner only). The link will appear in their "Shared with me" view.
 * @param role VIEWER = read only, EDITOR = can edit the link
 */
export async function shareLinkWithUser(
  linkId: string,
  sharedWithUserId: string,
  role: "VIEWER" | "EDITOR" = "VIEWER"
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.share", "links.update");

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });
    if (!link || link.userId !== user.id) {
      return { success: false, error: "Link not found or you can only share your own links" };
    }
    if (sharedWithUserId === user.id) {
      return { success: false, error: "Cannot share a link with yourself" };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: sharedWithUserId },
      select: { id: true, status: true },
    });
    if (!targetUser || targetUser.status !== "ACTIVE") {
      return { success: false, error: "User not found or not active" };
    }

    if (typeof (prisma as { linkShare?: unknown }).linkShare === "undefined") {
      return {
        success: false,
        error: "Link sharing is not available. Run: pnpm exec prisma generate",
      };
    }

    await prisma.linkShare.upsert({
      where: {
        linkId_sharedWithUserId: { linkId, sharedWithUserId },
      },
      update: { role },
      create: { linkId, sharedWithUserId, role },
    });

    auditLog({
      action: "links.share",
      userId: user.id,
      resourceType: "link",
      resourceId: linkId,
      context: { sharedWithUserId, role },
    });
    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error sharing link with user:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to share link",
    };
  }
}

/**
 * Get users a link is shared with (link owner only).
 */
export async function getLinkShares(linkId: string): Promise<
  Array<{ id: string; sharedWithUserId: string; role: "VIEWER" | "EDITOR"; sharedWithUser: { id: string; name: string | null; email: string } }>
> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) return [];

    const user = await requireAuth();
    await requireAnyPermission("links.share", "links.update");

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });
    if (!link || link.userId !== user.id) return [];

    const shares = await prisma.linkShare.findMany({
      where: { linkId },
      include: {
        sharedWithUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    return shares;
  } catch {
    return [];
  }
}

/**
 * Update the role of a link share (link owner only).
 */
export async function updateLinkShareRole(
  linkId: string,
  sharedWithUserId: string,
  role: "VIEWER" | "EDITOR"
): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.share", "links.update");

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });
    if (!link || link.userId !== user.id) {
      return { success: false, error: "Link not found or you can only update your own link shares" };
    }

    if (typeof (prisma as { linkShare?: unknown }).linkShare === "undefined") {
      return { success: false, error: "Link sharing is not available. Run: pnpm exec prisma generate" };
    }

    await prisma.linkShare.update({
      where: { linkId_sharedWithUserId: { linkId, sharedWithUserId } },
      data: { role },
    });

    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error updating link share role:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update role",
    };
  }
}

/**
 * Remove a direct link share (link owner only).
 */
export async function unshareLink(linkId: string, sharedWithUserId: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.share", "links.update");

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });
    if (!link || link.userId !== user.id) {
      return { success: false, error: "Link not found or you can only unshare your own links" };
    }

    await prisma.linkShare.deleteMany({
      where: { linkId, sharedWithUserId },
    });

    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error unsharing link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unshare link",
    };
  }
}

/**
 * Count of links shared directly with the current user (for "Shared with me" badge).
 */
export async function getSharedWithMeCount(): Promise<number> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) return 0;

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    return prisma.linkShare.count({
      where: { sharedWithUserId: user.id },
    });
  } catch {
    return 0;
  }
}

/**
 * Remove a link from "Shared with me" for the current user only.
 * Deletes the LinkShare for this user; the link and shares for other users are unchanged.
 */
export async function removeSharedLinkForMe(linkId: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    await prisma.linkShare.deleteMany({
      where: { linkId, sharedWithUserId: user.id },
    });

    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error removing shared link for me:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove from Shared with me",
    };
  }
}

/**
 * Remove multiple links from "Shared with me" for the current user only (bulk).
 */
export async function bulkRemoveSharedLinksForMe(linkIds: string[]): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    if (linkIds.length === 0) return { success: true };

    await prisma.linkShare.deleteMany({
      where: { sharedWithUserId: user.id, linkId: { in: linkIds } },
    });

    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error bulk removing shared links for me:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove from Shared with me",
    };
  }
}

/**
 * Copy a link shared with the current user into their own collection (creates a new link owned by them; does not affect the original).
 */
export async function copySharedLinkToMyCollection(
  linkId: string,
  collectionId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.create");

    const share = await prisma.linkShare.findUnique({
      where: { linkId_sharedWithUserId: { linkId, sharedWithUserId: user.id } },
      include: {
        link: {
          select: {
            id: true,
            title: true,
            url: true,
            description: true,
            favicon: true,
            linkType: true,
            tags: true,
            notes: true,
            isFavorite: true,
            rating: true,
            metadata: true,
            normalizedUrl: true,
          },
        },
      },
    });
    if (!share) {
      return { success: false, error: "Link is not shared with you or no longer available" };
    }

    const collection = await prisma.collection.findFirst({
      where: { id: collectionId, ownerId: user.id },
      select: { id: true },
    });
    if (!collection) {
      return { success: false, error: "Collection not found or you don't own it" };
    }

    const src = share.link;
    const newLink = await prisma.link.create({
      data: {
        userId: user.id,
        title: src.title,
        url: src.url,
        normalizedUrl: src.normalizedUrl,
        description: src.description,
        favicon: src.favicon,
        linkType: src.linkType,
        tags: src.tags,
        notes: src.notes,
        isFavorite: src.isFavorite,
        rating: src.rating,
        metadata: src.metadata != null ? (src.metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    await prisma.linkCollection.create({
      data: { linkId: newLink.id, collectionId },
    });

    revalidatePath("/dashboard/links");
    return { success: true, data: { id: newLink.id } };
  } catch (error) {
    logger.error("Error copying shared link to collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to copy link to collection",
    };
  }
}

/**
 * Bulk add links to a collection
 */
export async function bulkAddLinksToCollection(
  linkIds: string[],
  collectionId: string
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
    await requireAnyPermission("links.update");

    if (!linkIds.length) {
      return {
        success: false,
        error: "No links selected",
      };
    }

    // Verify all links belong to user
    const links = await prisma.link.findMany({
      where: { id: { in: linkIds }, userId: user.id },
      select: { id: true },
    });
    if (links.length !== linkIds.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission",
      };
    }

    // Verify collection access
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
                role: { in: ["VIEWER", "EDITOR"] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!collection) {
      return {
        success: false,
        error: "Collection not found or you don't have access",
      };
    }

    // Get existing link-collection pairs to avoid unique constraint violation
    const existing = await prisma.linkCollection.findMany({
      where: {
        collectionId,
        linkId: { in: linkIds },
      },
      select: { linkId: true },
    });
    const existingLinkIds = new Set(existing.map((e) => e.linkId));
    const toAdd = linkIds.filter((id) => !existingLinkIds.has(id));

    if (toAdd.length > 0) {
      await prisma.linkCollection.createMany({
        data: toAdd.map((linkId) => ({ linkId, collectionId })),
      });
    }

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    console.error("Error bulk adding links to collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add links to collection",
    };
  }
}

/**
 * Create a new collection and add selected links to it
 */
export async function bulkCreateCollectionWithLinks(
  linkIds: string[],
  name: string,
  color?: string
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
    await requireAnyPermission("collections.create", "links.update");

    if (!linkIds.length) {
      return {
        success: false,
        error: "No links selected",
      };
    }

    if (!name || name.trim().length === 0) {
      return {
        success: false,
        error: "Collection name is required",
        fieldErrors: { name: ["Collection name cannot be empty"] },
      };
    }

    // Verify all links belong to user
    const links = await prisma.link.findMany({
      where: { id: { in: linkIds }, userId: user.id },
      select: { id: true },
    });
    if (links.length !== linkIds.length) {
      return {
        success: false,
        error: "Some links were not found or you don't have permission",
      };
    }

    const { createCollection } = await import("./collections");
    const createResult = await createCollection({
      name: name.trim(),
      color: color?.trim() || undefined,
    });
    if (!createResult.success) {
      return {
        success: false,
        error: createResult.error ?? "Failed to create collection",
        fieldErrors: createResult.fieldErrors,
      };
    }
    if (!createResult.data) {
      return {
        success: false,
        error: "Failed to create collection",
      };
    }

    const collectionId = createResult.data.id;
    await prisma.linkCollection.createMany({
      data: linkIds.map((linkId) => ({ linkId, collectionId })),
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { id: collectionId },
    };
  } catch (error) {
    console.error("Error creating collection with links:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create collection",
    };
  }
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(linkId: string): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.update");

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true, isFavorite: true },
    });

    if (!link || link.userId !== user.id) {
      return {
        success: false,
        error: "Link not found or you don't have permission",
      };
    }

    await prisma.link.update({
      where: { id: linkId },
      data: { isFavorite: !link.isFavorite },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error toggling favorite:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle favorite",
    };
  }
}

/**
 * Update link rating
 */
export async function updateRating(
  linkId: string,
  rating: number | null
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
    await requireAnyPermission("links.update");

    // Validate rating
    if (rating !== null && (rating < 1 || rating > 5)) {
      return {
        success: false,
        error: "Rating must be between 1 and 5",
      };
    }

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { userId: true },
    });

    if (!link || link.userId !== user.id) {
      return {
        success: false,
        error: "Link not found or you don't have permission",
      };
    }

    await prisma.link.update({
      where: { id: linkId },
      data: { rating: rating || null },
    });

    revalidatePath("/dashboard/links");
    return {
      success: true,
    };
  } catch (error) {
    logger.error("Error updating rating:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update rating",
    };
  }
}

/**
 * Bulk update tags on multiple links owned by the current user.
 * Replaces the tags array on each selected link.
 */
export async function bulkUpdateLinkTags(ids: string[], tags: string[]): Promise<ActionResult> {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return { success: false, error: "Links module is not enabled" };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.update");

    // Verify ownership — only update links that belong to the current user
    const owned = await prisma.link.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    });

    if (owned.length === 0) {
      return { success: false, error: "No matching links found or you don't have permission to update them" };
    }

    const ownedIds = owned.map((l: { id: string }) => l.id);
    const normalizedTags = tags.map((t) => t.trim().toLowerCase()).filter(Boolean);

    await prisma.link.updateMany({
      where: { id: { in: ownedIds }, userId: user.id },
      data: { tags: normalizedTags },
    });

    revalidatePath("/dashboard/links");
    return { success: true };
  } catch (error) {
    logger.error("Error bulk updating link tags:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update link tags",
    };
  }
}
