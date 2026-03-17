import type { LinkMetadata } from "@/lib/utils/link-metadata";
import { extractYouTubeVideoId } from "@/lib/utils/links";

/**
 * Best-effort extraction of a textual description from the YouTube watch page HTML.
 * We keep this local to YouTube so the generic extractor stays lean.
 */
async function fetchYouTubeDescriptionFromPage(url: string): Promise<string | undefined> {
  try {
    let fetchUrl = url.trim();
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = `https://${fetchUrl}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return undefined;
      }

      const html = await response.text();

      // Prefer Open Graph description
      let match =
        html.match(
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
        );
      if (match?.[1]) {
        return match[1].trim();
      }

      // Fallback to standard meta description
      match =
        html.match(
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
        );
      if (match?.[1]) {
        return match[1].trim();
      }

      return undefined;
    } catch {
      clearTimeout(timeoutId);
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Fetch rich metadata for YouTube videos using the public oEmbed endpoint.
 *
 * This lives in a separate module so we can expand YouTube-specific
 * fields without bloating the generic link metadata extractor.
 *
 * Docs: https://www.youtube.com/oembed
 */
export async function extractYouTubeMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    const videoId = extractYouTubeVideoId(url);

    if (!videoId) {
      return null;
    }

    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      url,
    )}&format=json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(oEmbedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
        provider_name?: string;
      };

      const title = data.title || undefined;
      // Try to augment with a description from the watch page HTML, since
      // the oEmbed payload does not expose it.
      const description = await fetchYouTubeDescriptionFromPage(url);
      const thumbnail = data.thumbnail_url || undefined;
      const siteName = data.provider_name || "YouTube";

      const metadata: LinkMetadata = {
        // Core fields
        title,
        description,
        image: thumbnail,
        author: data.author_name || undefined,
        favicon: "https://www.google.com/s2/favicons?domain=youtube.com&sz=64",

        // Open Graph-style fields
        ogTitle: title,
        ogDescription: description,
        ogImage: thumbnail,
        ogType: "video",
        ogUrl: url,
        ogSiteName: siteName,

        // Twitter Card-style fields
        twitterTitle: title,
        twitterDescription: description,
        twitterImage: thumbnail,
        twitterCard: thumbnail ? "summary_large_image" : "summary",

        // We intentionally leave keywords empty here; if you ever decide to
        // use the Data API v3 with an API key, you can enrich that in this
        // module without touching the generic extractor.
        keywords: undefined,
      };

      return metadata;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

