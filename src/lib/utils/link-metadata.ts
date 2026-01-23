/**
 * Link metadata extraction utilities
 * Fetches and extracts metadata from URLs (title, description, Open Graph tags, etc.)
 */

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Extract favicon URL from page HTML or use default
 */
export function extractFaviconFromUrl(url: string, html?: string): string {
  if (!html) {
    // Use Google's favicon service as fallback
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      return "";
    }
  }

  try {
    // Try to find favicon in HTML
    const faviconMatch = html.match(
      /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i
    );
    if (faviconMatch && faviconMatch[1]) {
      const faviconUrl = faviconMatch[1];
      // Convert relative URLs to absolute
      if (faviconUrl.startsWith("http://") || faviconUrl.startsWith("https://")) {
        return faviconUrl;
      }
      try {
        const baseUrl = new URL(url);
        return new URL(faviconUrl, baseUrl.origin).href;
      } catch {
        return faviconUrl;
      }
    }
  } catch {
    // Ignore errors
  }

  // Fallback to Google's favicon service
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

/**
 * Sanitize extracted metadata (remove HTML, limit length)
 */
export function sanitizeMetadata(metadata: LinkMetadata): LinkMetadata {
  const sanitize = (text?: string, maxLength = 500): string | undefined => {
    if (!text) return undefined;
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, "");
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // Trim and limit length
    cleaned = cleaned.trim();
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + "...";
    }
    return cleaned || undefined;
  };

  return {
    title: sanitize(metadata.title, 200),
    description: sanitize(metadata.description, 500),
    image: metadata.image,
    favicon: metadata.favicon,
    ogTitle: sanitize(metadata.ogTitle, 200),
    ogDescription: sanitize(metadata.ogDescription, 500),
    ogImage: metadata.ogImage,
    ogType: metadata.ogType,
    twitterTitle: sanitize(metadata.twitterTitle, 200),
    twitterDescription: sanitize(metadata.twitterDescription, 500),
    twitterImage: metadata.twitterImage,
  };
}

/**
 * Extract metadata from HTML content
 */
export function extractMetadataFromHtml(html: string, url: string): LinkMetadata {
  const metadata: LinkMetadata = {};

  try {
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      metadata.title = titleMatch[1].trim();
    }

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (descMatch && descMatch[1]) {
      metadata.description = descMatch[1].trim();
    }

    // Extract Open Graph tags
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      metadata.ogTitle = ogTitleMatch[1].trim();
    }

    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      metadata.ogDescription = ogDescMatch[1].trim();
    }

    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImageMatch && ogImageMatch[1]) {
      const ogImage = ogImageMatch[1].trim();
      // Convert relative URLs to absolute
      if (ogImage.startsWith("http://") || ogImage.startsWith("https://")) {
        metadata.ogImage = ogImage;
      } else {
        try {
          const baseUrl = new URL(url);
          metadata.ogImage = new URL(ogImage, baseUrl.origin).href;
        } catch {
          metadata.ogImage = ogImage;
        }
      }
    }

    const ogTypeMatch = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i);
    if (ogTypeMatch && ogTypeMatch[1]) {
      metadata.ogType = ogTypeMatch[1].trim();
    }

    // Extract Twitter Card tags
    const twitterTitleMatch = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
    if (twitterTitleMatch && twitterTitleMatch[1]) {
      metadata.twitterTitle = twitterTitleMatch[1].trim();
    }

    const twitterDescMatch = html.match(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i);
    if (twitterDescMatch && twitterDescMatch[1]) {
      metadata.twitterDescription = twitterDescMatch[1].trim();
    }

    const twitterImageMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (twitterImageMatch && twitterImageMatch[1]) {
      const twitterImage = twitterImageMatch[1].trim();
      // Convert relative URLs to absolute
      if (twitterImage.startsWith("http://") || twitterImage.startsWith("https://")) {
        metadata.twitterImage = twitterImage;
      } else {
        try {
          const baseUrl = new URL(url);
          metadata.twitterImage = new URL(twitterImage, baseUrl.origin).href;
        } catch {
          metadata.twitterImage = twitterImage;
        }
      }
    }

    // Extract favicon
    metadata.favicon = extractFaviconFromUrl(url, html);
  } catch (error) {
    console.error("Error extracting metadata from HTML:", error);
  }

  return sanitizeMetadata(metadata);
}

/**
 * Fetch and extract metadata from a URL
 * This should be called server-side only
 */
export async function extractLinkMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    // Validate URL
    let fetchUrl = url;
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = `https://${fetchUrl}`;
    }

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const metadata = extractMetadataFromHtml(html, fetchUrl);

      // Use priority: Open Graph > Twitter Card > Meta tags > Title tag
      return {
        title: metadata.ogTitle || metadata.twitterTitle || metadata.title || undefined,
        description: metadata.ogDescription || metadata.twitterDescription || metadata.description || undefined,
        image: metadata.ogImage || metadata.twitterImage || metadata.image || undefined,
        favicon: metadata.favicon,
        ogTitle: metadata.ogTitle,
        ogDescription: metadata.ogDescription,
        ogImage: metadata.ogImage,
        ogType: metadata.ogType,
        twitterTitle: metadata.twitterTitle,
        twitterDescription: metadata.twitterDescription,
        twitterImage: metadata.twitterImage,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error("Error fetching metadata for URL:", url, error);
    // Return minimal metadata with URL as title
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return {
        title: urlObj.hostname.replace(/^www\./, ""),
        favicon: extractFaviconFromUrl(url),
      };
    } catch {
      return {
        title: url,
      };
    }
  }
}
