"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, requireAnyPermission } from "@/lib/utils/auth-server";
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
};

export type LinkFilters = {
  userId?: string;
  linkType?: LinkType;
  tags?: string[];
  collectionId?: string; // Filter by collection
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
      include: {
        collections: {
          include: {
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
 * Check for duplicate and very similar URLs.
 *
 * - Exact duplicates are links where the fully formatted URL matches 1:1
 * - Similar links share the same normalized URL (ignoring protocol, www, trailing slash, etc.)
 *
 * Uses normalizedUrl when set for efficient DB query; falls back to in-memory check for legacy rows.
 */
export async function checkDuplicateUrl(
  url: string,
  userId: string,
  excludeLinkId?: string
): Promise<{ exactDuplicateIds: string[]; similarLinkIds: string[] }> {
  const normalized = normalizeUrl(url);
  const exactDuplicateIds: string[] = [];
  const similarLinkIds: string[] = [];

  // Query by normalizedUrl when we have an index (efficient path)
  const byNormalized = await prisma.link.findMany({
    where: {
      userId,
      normalizedUrl: normalized,
      ...(excludeLinkId ? { id: { not: excludeLinkId } } : {}),
    },
    select: { id: true, url: true },
  });

  for (const link of byNormalized) {
    if (link.url === url) {
      exactDuplicateIds.push(link.id);
    } else {
      similarLinkIds.push(link.id);
    }
  }

  // For legacy rows with null normalizedUrl, do in-memory check (one-time fetch)
  const legacyLinks = await prisma.link.findMany({
    where: {
      userId,
      normalizedUrl: null,
      ...(excludeLinkId ? { id: { not: excludeLinkId } } : {}),
    },
    select: { id: true, url: true },
  });

  for (const link of legacyLinks) {
    if (link.id === excludeLinkId) continue;
    if (link.url === url) {
      exactDuplicateIds.push(link.id);
    } else if (normalizeUrl(link.url) === normalized) {
      similarLinkIds.push(link.id);
    }
  }

  return { exactDuplicateIds, similarLinkIds };
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
 * Create a new link
 */
export async function createLink(input: LinkInput): Promise<ActionResult<{ id: string }>> {
  try {
    // Check if links module is enabled
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return {
        success: false,
        error: "Links module is not enabled",
      };
    }

    const user = await requireAuth();
    await requireAnyPermission("links.create");

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
      const { exactDuplicateIds, similarLinkIds } = await checkDuplicateUrl(formattedUrl, user.id);

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
    let favicon = validated.favicon || undefined;

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

    // Get favicon if not provided
    if (!favicon) {
      favicon = getFaviconUrl(formattedUrl);
    }

    // Cache favicon locally so we don't have to rely on the remote
    // site (or Google's favicon service) on every render.
    if (favicon) {
      try {
        let cachedFavicon = await cacheFavicon(favicon);

        // If caching the extracted favicon failed (for example because it's a data: URL),
        // fall back to a generic favicon URL derived from the site and cache that instead.
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
        userId: user.id,
      },
    });

    // Add to collections if specified
    if (validated.collectionIds && validated.collectionIds.length > 0) {
      // Verify user has access to these collections
      const collections = await prisma.collection.findMany({
        where: {
          id: { in: validated.collectionIds },
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

    revalidatePath("/dashboard/links");
    return {
      success: true,
      data: { id: link.id },
      // Surface similar links as a non-blocking warning
      // (only present when there were similar links but no exact duplicates)
      // Note: when allowDuplicates is true, we skip duplicate checking entirely.
    };
  } catch (error) {
    logger.error("Error creating link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create link",
    };
  }
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

    // Get existing link
    const existingLink = await prisma.link.findUnique({
      where: { id },
      select: { id: true, userId: true, url: true },
    });

    if (!existingLink) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    // Check ownership or permission
    if (existingLink.userId !== user.id) {
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
      const { exactDuplicateIds, similarLinkIds } = await checkDuplicateUrl(formattedUrl, user.id, id);
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
      select: { userId: true },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    if (link.userId !== user.id) {
      return {
        success: false,
        error: "You don't have permission to delete this link",
      };
    }

    await prisma.link.delete({
      where: { id },
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
    await requireAnyPermission("links.update");

    const link = await prisma.link.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    if (link.userId !== user.id) {
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
    await requireAnyPermission("links.update");

    const link = await prisma.link.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!link) {
      return {
        success: false,
        error: "Link not found",
      };
    }

    if (link.userId !== user.id) {
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
    await requireAnyPermission("links.update");

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

    const where: Prisma.LinkWhereInput = {};

    // User filter - default to current user unless viewing all
    if (filters.userId) {
      where.userId = filters.userId;
    } else {
      where.userId = user.id;
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

    // Collection filter
    if (filters.collectionId) {
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

    // Search filter
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { url: { contains: filters.search, mode: "insensitive" } },
        { notes: { contains: filters.search, mode: "insensitive" } },
        { tags: { hasSome: [filters.search] } },
      ];
    }

    // Sort and pagination
    const sortBy = filters.sortBy || "createdAt";
    const sortOrder = filters.sortOrder || "desc";
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const [links, total] = await Promise.all([
      prisma.link.findMany({
        where,
        include: {
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
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.link.count({ where }),
    ]);

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
    logger.error("Error fetching links:", error);
    return { links: [], total: 0, page: 1, limit: 50, totalPages: 0 };
  }
}

export type ExportLinksOptions = {
  format: "json" | "csv";
  collectionId?: string;
  archived?: boolean;
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
    await requireAnyPermission("links.view");

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

    if (options.format === "json") {
      const payload = links.map((link) => ({
        id: link.id,
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
        collections: link.collections.map((lc) => ({
          id: lc.collection.id,
          name: lc.collection.name,
          color: lc.collection.color,
        })),
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
      "id",
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
      "collectionNames",
    ];
    const rows = links.map((link) => [
      link.id,
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
      link.collections.map((lc) => lc.collection.name).join("; "),
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

export type ImportLinksOptions = {
  format: "json" | "csv";
  collectionId?: string;
  skipDuplicates?: boolean;
};

export type ImportLinksResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; url?: string; error: string }>;
};

/**
 * Import links from JSON or CSV content.
 * Client should read file and pass content string.
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
    await requireAnyPermission("links.create");

    let rows: Array<Record<string, unknown>> = [];
    if (options.format === "json") {
      try {
        const parsed = JSON.parse(content);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return {
          success: false,
          error: "Invalid JSON. Expected an array of link objects.",
        };
      }
    } else {
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) {
        return {
          success: false,
          error: "CSV must have a header row and at least one data row.",
        };
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
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row: Record<string, unknown> = {};
        header.forEach((h, j) => {
          row[h] = values[j] ?? "";
        });
        rows.push(row);
      }
    }

    const collectionIds = options.collectionId ? [options.collectionId] : undefined;
    const skipDuplicates = options.skipDuplicates ?? true;
    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; url?: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
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

    // Check access
    if (link.userId !== user.id) {
      return null;
    }

    return link;
  } catch (error) {
    logger.error("Error fetching link:", error);
    return null;
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
