import { z } from "zod";

const linkTypeEnum = z.enum([
  "WEBSITE",
  "FILE",
  "DOCUMENT",
  "VIDEO",
  "IMAGE",
  "OTHER",
]);

/**
 * Validates URL format (allows URL without protocol; will be normalized server-side).
 */
function isValidUrl(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  try {
    const withProtocol =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    const u = new URL(withProtocol);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Link creation schema
 */
export const createLinkSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .max(2048, "URL must be less than 2048 characters")
    .trim()
    .refine(isValidUrl, "Please enter a valid URL"),
  title: z
    .string()
    .max(500, "Title must be less than 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  favicon: z.string().max(2048).optional().or(z.literal("")),
  linkType: linkTypeEnum.optional(),
  tags: z
    .array(z.string().max(100).trim())
    .max(50, "Maximum 50 tags")
    .optional()
    .default([]),
  notes: z
    .string()
    .max(10000, "Notes must be less than 10000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  isFavorite: z.boolean().optional().default(false),
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .optional(),
  collectionIds: z.array(z.string().min(1).max(30)).optional().default([]),
  extractMetadata: z.boolean().optional(),
  allowDuplicates: z.boolean().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

/**
 * Link update schema
 */
export const updateLinkSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .max(2048, "URL must be less than 2048 characters")
    .trim()
    .refine(isValidUrl, "Please enter a valid URL")
    .optional(),
  title: z
    .string()
    .max(500, "Title must be less than 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  favicon: z.string().max(2048).optional().or(z.literal("")),
  linkType: linkTypeEnum.optional(),
  tags: z.array(z.string().max(100).trim()).max(50).optional(),
  notes: z
    .string()
    .max(10000, "Notes must be less than 10000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  isFavorite: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  collectionIds: z.array(z.string().min(1).max(30)).optional(),
  extractMetadata: z.boolean().optional(),
});

export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

/**
 * Schema for a single link row when importing (e.g. from JSON/CSV).
 * URL is required; other fields optional.
 */
export const importLinkRowSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .max(2048, "URL must be less than 2048 characters")
    .trim()
    .refine(isValidUrl, "Invalid URL"),
  title: z.string().max(500).trim().optional().or(z.literal("")),
  description: z.string().max(2000).trim().optional().or(z.literal("")),
  linkType: linkTypeEnum.optional(),
  tags: z.union([
    z.array(z.string().max(100)),
    z.string().transform((s) => (s ? s.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [])),
  ]).optional().default([]),
  notes: z.string().max(10000).trim().optional().or(z.literal("")),
  isFavorite: z.boolean().optional().default(false),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

export type ImportLinkRow = z.infer<typeof importLinkRowSchema>;
