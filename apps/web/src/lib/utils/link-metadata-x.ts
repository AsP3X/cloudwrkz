import type { LinkMetadata } from "@/lib/utils/link-metadata";
import { extractMetadataFromHtml, extractFaviconFromUrl } from "@/lib/utils/link-metadata";

/**
 * Fetch and extract metadata for X (Twitter) statuses and profiles.
 *
 * We use HTML + existing generic parsing so we get OG/Twitter meta
 * handling, but keep this in a separate module so that if you ever
 * add an authenticated API client, it can plug in here.
 */
export async function extractXMetadata(url: string): Promise<LinkMetadata | null> {
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
        return null;
      }

      const html = await response.text();

      const base = extractMetadataFromHtml(html, response.url || fetchUrl);

      const favicon =
        base.favicon || extractFaviconFromUrl(response.url || fetchUrl, html);

      return {
        ...base,
        ogSiteName: base.ogSiteName || "X",
        favicon,
      };
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

