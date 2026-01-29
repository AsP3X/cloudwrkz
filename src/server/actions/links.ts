"use server";

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
 * This ensures we only block on true exact duplicates, while still being able
 * to surface "very similar" URLs as a warning to the user.
 */
export async function checkDuplicateUrl(
  url: string,
  userId: string,
  excludeLinkId?: string
): Promise<{ exactDuplicateIds: string[]; similarLinkIds: string[] }> {
  const normalizedUrl = normalizeUrl(url);
  const existingLinks = await prisma.link.findMany({
    where: {
      userId,
      url: {
        // This is a simplified check - in production, you might want to store normalized URLs
        // For now, we'll check both the original URL and normalized versions
      },
    },
    select: { id: true, url: true },
  });

  const exactDuplicateIds: string[] = [];
  const similarLinkIds: string[] = [];
  for (const link of existingLinks) {
    if (link.id === excludeLinkId) continue;
    // Exact duplicate: full URL including query/fragment matches after formatting
    if (link.url === url) {
      exactDuplicateIds.push(link.id);
      continue;
    }

    // Very similar: normalized URL matches but full URL differs (e.g. small query changes)
    if (normalizeUrl(link.url) === normalizedUrl) {
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
    console.error("Error fetching link tag suggestions:", error);
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
      console.error("Metadata extraction failed while refetching favicon:", error);
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
      console.error("Favicon caching failed while refetching:", error);
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
    console.error("Error refetching favicon:", error);
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

    // Validate URL
    if (!input.url || input.url.trim().length === 0) {
      return {
        success: false,
        error: "URL is required",
        fieldErrors: { url: ["URL cannot be empty"] },
      };
    }

    // Format URL (add protocol if missing)
    const formattedUrl = formatLinkUrl(input.url);

    if (!validateUrl(formattedUrl)) {
      return {
        success: false,
        error: "Invalid URL format",
        fieldErrors: { url: ["Please enter a valid URL"] },
      };
    }

    // Check for duplicates (unless explicitly allowed)
    if (!input.allowDuplicates) {
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
    let title = input.title?.trim() || "";
    let description = input.description?.trim() || "";
    let favicon = input.favicon;

    if (input.extractMetadata || !title || !description) {
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
        console.error("Metadata extraction failed:", error);
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
    const linkType = input.linkType || getLinkTypeFromUrl(formattedUrl);

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
        console.error("Favicon caching failed:", error);
      }
    }

    // Validate rating
    let rating: number | null | undefined = input.rating;
    if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
      rating = null;
    }

    // Create link
    const link = await prisma.link.create({
      data: {
        title,
        url: formattedUrl,
        description: description || null,
        favicon: favicon || null,
        linkType,
        tags: input.tags || [],
        notes: input.notes?.trim() || null,
        isFavorite: input.isFavorite || false,
        rating: rating || null,
        metadata: metadata ? (metadata as any) : null,
        metadataExtractedAt,
        userId: user.id,
      },
    });

    // Add to collections if specified
    if (input.collectionIds && input.collectionIds.length > 0) {
      // Verify user has access to these collections
      const collections = await prisma.collection.findMany({
        where: {
          id: { in: input.collectionIds },
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
    console.error("Error creating link:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create link",
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

    // If URL changed, validate and check for duplicates
    let formattedUrl = existingLink.url;
    if (input.url && input.url !== existingLink.url) {
      formattedUrl = formatLinkUrl(input.url);
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
    let title = input.title?.trim();
    let description = input.description?.trim();
    let favicon = input.favicon;

    if (input.extractMetadata || (input.url && input.url !== existingLink.url)) {
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
        console.error("Metadata extraction failed:", error);
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
        console.error("Favicon caching failed:", error);
      }
    }

    // Validate rating
    let rating: number | null | undefined = input.rating;
    if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
      rating = null;
    }

    // Update link
    const updateData: any = {};
    if (input.url !== undefined) updateData.url = formattedUrl;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (input.favicon !== undefined || favicon) updateData.favicon = favicon || null;
    if (input.linkType !== undefined) updateData.linkType = input.linkType;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;
    if (input.isFavorite !== undefined) updateData.isFavorite = input.isFavorite;
    if (input.rating !== undefined) updateData.rating = rating || null;
    if (metadata) {
      updateData.metadata = metadata as any;
      updateData.metadataExtractedAt = metadataExtractedAt;
    }

    await prisma.link.update({
      where: { id },
      data: updateData,
    });

    // Update collections if specified
    if (input.collectionIds !== undefined) {
      // Remove all existing collection associations
      await prisma.linkCollection.deleteMany({
        where: { linkId: id },
      });

      // Add new collections
      if (input.collectionIds.length > 0) {
        const collections = await prisma.collection.findMany({
          where: {
            id: { in: input.collectionIds },
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
    console.error("Error updating link:", error);
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
    console.error("Error deleting link:", error);
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
    console.error("Error archiving link:", error);
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
    console.error("Error unarchiving link:", error);
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
    console.error("Bulk unarchive links error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to unarchive links",
    };
  }
}

/**
 * Get links with filtering
 */
export async function getLinks(filters: LinkFilters = {}) {
  try {
    const moduleEnabled = await isModuleEnabled(MODULE_KEYS.LINKS);
    if (!moduleEnabled) {
      return [];
    }

    const user = await requireAuth();
    await requireAnyPermission("links.view");

    const where: any = {};

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

    // Sort
    const sortBy = filters.sortBy || "createdAt";
    const sortOrder = filters.sortOrder || "desc";

    const links = await prisma.link.findMany({
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
    });

    return links.map((link) => ({
      ...link,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    }));
  } catch (error) {
    console.error("Error fetching links:", error);
    return [];
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
    console.error("Error fetching link:", error);
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

    const updateData: any = {};
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
    console.error("Error bulk updating links:", error);
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
    console.error("Error bulk deleting links:", error);
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
    console.error("Error bulk archiving links:", error);
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
    console.error("Error adding link to collection:", error);
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
    console.error("Error removing link from collection:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove link from collection",
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
    console.error("Error toggling favorite:", error);
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
    console.error("Error updating rating:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update rating",
    };
  }
}
