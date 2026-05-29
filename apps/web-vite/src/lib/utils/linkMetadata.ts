// Human: Helpers to read scraped website fields from `links.metadata` for detail-page previews and robots.txt warnings.
// Agent: PURE functions on Record metadata; READS camelCase keys from API scrape; resolveLinkPreviewAssetUrl for /api/screenshots paths.

import { getApiBaseUrl } from "@/lib/apiBaseUrl";

export interface RobotsTxtStatus {
  allowed: boolean;
  message: string | null;
}

export function getRobotsTxtStatus(
  metadata: Record<string, unknown> | null | undefined,
): RobotsTxtStatus {
  if (!metadata || typeof metadata !== "object") {
    return { allowed: true, message: null };
  }
  if (metadata.robotsTxtAllowed === false) {
    const msg =
      typeof metadata.robotsTxtMessage === "string" && metadata.robotsTxtMessage.trim()
        ? metadata.robotsTxtMessage
        : "This site's robots.txt disallows automated fetching. Preview data may be incomplete.";
    return { allowed: false, message: msg };
  }
  return { allowed: true, message: null };
}

function pickString(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Resolve `/api/screenshots/...` or other API-hosted preview assets against the API base URL. */
export function resolveLinkPreviewAssetUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const raw = path.trim();
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) {
    const base = getApiBaseUrl().replace(/\/$/, "");
    return `${base}${raw}`;
  }
  return raw;
}

export interface WebsitePreviewFields {
  headline: string | null;
  description: string | null;
  screenshotUrl: string | null;
  imageUrl: string | null;
  siteName: string | null;
  author: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  themeColor: string | null;
  language: string | null;
  ogType: string | null;
  twitterCard: string | null;
}

// Human: Prefer Open Graph and Twitter fields, then fall back to basic title/description/image from the scrape.
// Agent: READS og* twitter* title description image favicon keys; RETURNS display-ready strings.

export function getWebsitePreviewFields(
  metadata: Record<string, unknown> | null | undefined,
): WebsitePreviewFields | null {
  if (!metadata || typeof metadata !== "object") return null;

  const headline = pickString(
    metadata,
    "ogTitle",
    "twitterTitle",
    "title",
  );
  const description = pickString(
    metadata,
    "ogDescription",
    "twitterDescription",
    "description",
  );
  const screenshotUrl = resolveLinkPreviewAssetUrl(pickString(metadata, "screenshotUrl"));
  const imageUrl = resolveLinkPreviewAssetUrl(
    pickString(metadata, "ogImage", "twitterImage", "image"),
  );
  const siteName = pickString(metadata, "ogSiteName");
  const author = pickString(metadata, "author");
  const keywords = pickString(metadata, "keywords");
  const canonicalUrl = pickString(metadata, "canonicalUrl", "ogUrl");
  const themeColor = pickString(metadata, "themeColor");
  const language = pickString(metadata, "language");
  const ogType = pickString(metadata, "ogType");
  const twitterCard = pickString(metadata, "twitterCard");

  const hasContent =
    headline ||
    description ||
    screenshotUrl ||
    imageUrl ||
    siteName ||
    author ||
    keywords ||
    canonicalUrl;

  if (!hasContent) return null;

  return {
    headline,
    description,
    screenshotUrl,
    imageUrl,
    siteName,
    author,
    keywords,
    canonicalUrl,
    themeColor,
    language,
    ogType,
    twitterCard,
  };
}

export function shouldOfferWebsiteMetadataRefresh(
  link: { url: string; metadata_extracted_at: string | null },
): boolean {
  if (/github\.com/i.test(link.url)) return false;
  return true;
}
