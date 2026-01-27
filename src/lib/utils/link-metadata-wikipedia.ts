import type { LinkMetadata } from "@/lib/utils/link-metadata";

/**
 * Simple helper to extract the language + page title segment from a Wikipedia URL.
 * Examples:
 * - https://en.wikipedia.org/wiki/Albert_Einstein => en, Albert_Einstein
 * - https://de.wikipedia.org/wiki/Albert_Einstein?foo=bar => de, Albert_Einstein
 */
function parseWikipediaUrl(url: string): { language: string; title: string } | null {
  try {
    const normalized = url.trim();
    const withProtocol =
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`;

    const u = new URL(withProtocol);

    if (!/\.wikipedia\.org$/i.test(u.hostname)) {
      return null;
    }

    const language = u.hostname.split(".")[0] || "en";

    // Expect paths like /wiki/Page_Title
    if (!u.pathname.startsWith("/wiki/")) {
      return null;
    }

    const rawTitle = u.pathname.replace(/^\/wiki\//, "");
    if (!rawTitle) {
      return null;
    }

    return {
      language,
      title: decodeURIComponent(rawTitle),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch rich metadata for Wikipedia pages using the official REST API.
 *
 * This is intentionally kept in a separate module so that we can
 * add more Wikipedia-specific fields without bloating the generic
 * link metadata extractor.
 *
 * API docs:
 * https://en.wikipedia.org/api/rest_v1/#/Page%20content/get_page_summary__title_
 */
export async function extractWikipediaMetadata(url: string): Promise<LinkMetadata | null> {
  const parsed = parseWikipediaUrl(url);
  if (!parsed) {
    return null;
  }

  const { language, title } = parsed;

  const apiUrl = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      title?: string;
      extract?: string;
      description?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
    };

    const pageUrl =
      data.content_urls?.desktop?.page ||
      data.content_urls?.mobile?.page ||
      url;

    const metadata: LinkMetadata = {
      title: data.title || undefined,
      description: data.extract || data.description || undefined,
      image: data.thumbnail?.source || undefined,
      ogTitle: data.title || undefined,
      ogDescription: data.extract || data.description || undefined,
      ogImage: data.thumbnail?.source || undefined,
      ogType: "article",
      ogUrl: pageUrl,
      ogSiteName: "Wikipedia",
      twitterTitle: data.title || undefined,
      twitterDescription: data.extract || data.description || undefined,
      twitterImage: data.thumbnail?.source || undefined,
      twitterCard: data.thumbnail?.source ? "summary_large_image" : "summary",
      author: undefined,
      keywords: undefined,
      favicon: `https://www.google.com/s2/favicons?domain=${language}.wikipedia.org&sz=64`,
    };

    return metadata;
  } catch {
    return null;
  }
}

