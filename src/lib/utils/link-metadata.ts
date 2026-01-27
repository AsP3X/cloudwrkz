/**
 * Link metadata extraction utilities
 * Fetches and extracts metadata from URLs (title, description, Open Graph tags, etc.)
 */

import {
  isGitHubUrl,
  isStackOverflowUrl,
  isXUrl,
  isYouTubeUrl,
  isWikipediaUrl,
} from "@/lib/utils/links";

export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  ogSiteName?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterCard?: string;
  author?: string;
  keywords?: string;
}

/**
 * Decode HTML entities more comprehensively
 */
function decodeHtmlEntities(text: string): string {
  const entityMap: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
    "&hellip;": "…",
    "&mdash;": "—",
    "&ndash;": "–",
  };

  // Decode named entities
  let decoded = text;
  for (const [entity, char] of Object.entries(entityMap)) {
    decoded = decoded.replace(new RegExp(entity, "gi"), char);
  }

  // Decode numeric entities (&#123; and &#x1F;)
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return decoded;
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
    const baseUrl = new URL(url);
    const domain = baseUrl.hostname.replace(/^www\./, "");

    // Try multiple favicon patterns
    const faviconPatterns = [
      /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i,
    ];

    for (const pattern of faviconPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let faviconUrl = decodeHtmlEntities(match[1].trim());
        
        // Handle protocol-relative URLs
        if (faviconUrl.startsWith("//")) {
          faviconUrl = `${baseUrl.protocol}${faviconUrl}`;
        }
        
        // Convert relative URLs to absolute
        if (faviconUrl.startsWith("http://") || faviconUrl.startsWith("https://")) {
          return faviconUrl;
        }
        
        try {
          return new URL(faviconUrl, baseUrl.origin).href;
        } catch {
          // If URL construction fails, try with base path
          try {
            return new URL(faviconUrl, `${baseUrl.protocol}//${baseUrl.host}`).href;
          } catch {
            return faviconUrl;
          }
        }
      }
    }

    // Try /favicon.ico as fallback
    try {
      const faviconUrl = new URL("/favicon.ico", baseUrl.origin).href;
      return faviconUrl;
    } catch {
      // Ignore
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
 * Resolve relative or protocol-relative URL to absolute URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    
    // Handle protocol-relative URLs
    if (url.startsWith("//")) {
      return `${base.protocol}${url}`;
    }
    
    // Already absolute
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    
    // Relative URL
    return new URL(url, base.origin).href;
  } catch {
    return url;
  }
}

/**
 * Extract meta tag content with multiple attribute patterns
 */
function extractMetaContent(
  html: string,
  patterns: Array<{ name?: string; property?: string; itemprop?: string }>
): string | undefined {
  for (const pattern of patterns) {
    let regex: RegExp;
    
    if (pattern.property) {
      // Open Graph: property="og:title"
      regex = new RegExp(
        `<meta[^>]+property=["']${pattern.property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
    } else if (pattern.name) {
      // Standard meta: name="description"
      regex = new RegExp(
        `<meta[^>]+name=["']${pattern.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
    } else if (pattern.itemprop) {
      // Schema.org: itemprop="name"
      regex = new RegExp(
        `<meta[^>]+itemprop=["']${pattern.itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
    } else {
      continue;
    }

    const match = html.match(regex);
    if (match && match[1]) {
      return decodeHtmlEntities(match[1].trim());
    }

    // Try reverse order (content before name/property)
    if (pattern.property) {
      regex = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${pattern.property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
      );
    } else if (pattern.name) {
      regex = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${pattern.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
      );
    } else if (pattern.itemprop) {
      regex = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${pattern.itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "i"
      );
    }

    const reverseMatch = html.match(regex);
    if (reverseMatch && reverseMatch[1]) {
      return decodeHtmlEntities(reverseMatch[1].trim());
    }
  }

  return undefined;
}

/**
 * Sanitize extracted metadata (remove HTML, limit length, normalize whitespace)
 */
export function sanitizeMetadata(metadata: LinkMetadata): LinkMetadata {
  const sanitize = (text?: string, maxLength = 500): string | undefined => {
    if (!text) return undefined;
    
    // Remove HTML tags
    let cleaned = text.replace(/<[^>]*>/g, "");
    
    // Decode HTML entities
    cleaned = decodeHtmlEntities(cleaned);
    
    // Normalize whitespace (replace multiple spaces/tabs/newlines with single space)
    cleaned = cleaned.replace(/\s+/g, " ");
    
    // Trim
    cleaned = cleaned.trim();
    
    // Remove leading/trailing punctuation that might be artifacts
    cleaned = cleaned.replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, "");
    
    if (cleaned.length === 0) return undefined;
    
    // Limit length
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim();
      // Try to cut at word boundary
      const lastSpace = cleaned.lastIndexOf(" ");
      if (lastSpace > maxLength * 0.8) {
        cleaned = cleaned.substring(0, lastSpace);
      }
      cleaned += "...";
    }
    
    return cleaned || undefined;
  };

  return {
    title: sanitize(metadata.title, 200),
    description: sanitize(metadata.description, 500),
    image: metadata.image ? resolveUrl(metadata.image, metadata.ogUrl || "") : undefined,
    favicon: metadata.favicon,
    ogTitle: sanitize(metadata.ogTitle, 200),
    ogDescription: sanitize(metadata.ogDescription, 500),
    ogImage: metadata.ogImage ? resolveUrl(metadata.ogImage, metadata.ogUrl || "") : undefined,
    ogType: metadata.ogType,
    ogUrl: metadata.ogUrl,
    ogSiteName: sanitize(metadata.ogSiteName, 100),
    twitterTitle: sanitize(metadata.twitterTitle, 200),
    twitterDescription: sanitize(metadata.twitterDescription, 500),
    twitterImage: metadata.twitterImage ? resolveUrl(metadata.twitterImage, metadata.ogUrl || "") : undefined,
    twitterCard: metadata.twitterCard,
    author: sanitize(metadata.author, 100),
    keywords: sanitize(metadata.keywords, 200),
  };
}

/**
 * Extract JSON-LD structured data
 */
function extractJsonLd(html: string): Partial<LinkMetadata> {
  const metadata: Partial<LinkMetadata> = {};
  
  try {
    const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (!jsonLdMatches) return metadata;

    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, "").trim();
        const data = JSON.parse(jsonContent);
        
        // Handle both single objects and arrays
        const items = Array.isArray(data) ? data : [data];
        
        for (const item of items) {
          if (item["@type"] === "Article" || item["@type"] === "BlogPosting" || item["@type"] === "WebPage") {
            if (item.headline && !metadata.title) {
              metadata.title = item.headline;
            }
            if (item.description && !metadata.description) {
              metadata.description = item.description;
            }
            if (item.image && !metadata.image) {
              const image = typeof item.image === "string" ? item.image : item.image.url || item.image[0]?.url;
              if (image) metadata.image = image;
            }
            if (item.author && !metadata.author) {
              const author = typeof item.author === "string" ? item.author : item.author.name;
              if (author) metadata.author = author;
            }
          }
        }
      } catch {
        // Skip invalid JSON
        continue;
      }
    }
  } catch {
    // Ignore errors
  }

  return metadata;
}

/**
 * Extract metadata from HTML content
 */
export function extractMetadataFromHtml(html: string, url: string): LinkMetadata {
  const metadata: LinkMetadata = {};

  try {
    // Extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      metadata.title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // Extract meta description with multiple patterns
    metadata.description = extractMetaContent(html, [
      { name: "description" },
      { itemprop: "description" },
    ]);

    // Extract Open Graph tags
    metadata.ogTitle = extractMetaContent(html, [{ property: "og:title" }]);
    metadata.ogDescription = extractMetaContent(html, [{ property: "og:description" }]);
    metadata.ogType = extractMetaContent(html, [{ property: "og:type" }]);
    metadata.ogUrl = extractMetaContent(html, [{ property: "og:url" }]);
    metadata.ogSiteName = extractMetaContent(html, [{ property: "og:site_name" }]);
    
    const ogImage = extractMetaContent(html, [{ property: "og:image" }]);
    if (ogImage) {
      metadata.ogImage = resolveUrl(ogImage, url);
    }

    // Extract Twitter Card tags
    metadata.twitterTitle = extractMetaContent(html, [{ name: "twitter:title" }]);
    metadata.twitterDescription = extractMetaContent(html, [{ name: "twitter:description" }]);
    metadata.twitterCard = extractMetaContent(html, [{ name: "twitter:card" }]);
    
    const twitterImage = extractMetaContent(html, [{ name: "twitter:image" }]);
    if (twitterImage) {
      metadata.twitterImage = resolveUrl(twitterImage, url);
    }

    // Extract author
    metadata.author = extractMetaContent(html, [
      { name: "author" },
      { property: "article:author" },
      { name: "twitter:creator" },
    ]);

    // Extract keywords
    metadata.keywords = extractMetaContent(html, [{ name: "keywords" }]);

    // Extract JSON-LD structured data
    const jsonLdData = extractJsonLd(html);
    if (jsonLdData.title && !metadata.ogTitle && !metadata.title) {
      metadata.title = jsonLdData.title;
    }
    if (jsonLdData.description && !metadata.ogDescription && !metadata.description) {
      metadata.description = jsonLdData.description;
    }
    if (jsonLdData.image && !metadata.ogImage && !metadata.twitterImage) {
      metadata.image = jsonLdData.image;
    }
    if (jsonLdData.author && !metadata.author) {
      metadata.author = jsonLdData.author;
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
    // Wikipedia links: use dedicated extractor for richer metadata,
    // keeping Wikipedia-specific logic in a separate module so this
    // file stays focused on generic metadata extraction.
    if (isWikipediaUrl(url)) {
      try {
        const { extractWikipediaMetadata } = await import(
          "@/lib/utils/link-metadata-wikipedia"
        );
        const wikipediaMetadata = await extractWikipediaMetadata(url);
        if (wikipediaMetadata && wikipediaMetadata.title) {
          return prioritizeMetadata(wikipediaMetadata, wikipediaMetadata.ogUrl || url);
        }
      } catch {
        // If the Wikipedia-specific extractor fails for any reason,
        // gracefully fall back to the generic HTML-based extractor.
      }
    }

    // GitHub links: use dedicated extractor so we can later
    // augment with repo-specific metadata.
    if (isGitHubUrl(url)) {
      try {
        const { extractGitHubMetadata } = await import(
          "@/lib/utils/link-metadata-github"
        );
        const githubMetadata = await extractGitHubMetadata(url);
        if (githubMetadata && githubMetadata.title) {
          return prioritizeMetadata(githubMetadata, githubMetadata.ogUrl || url);
        }
      } catch {
        // Fallback to generic extraction on failure
      }
    }

    // Stack Overflow links: dedicated extractor to make it easy
    // to later pull in question/answer specific data.
    if (isStackOverflowUrl(url)) {
      try {
        const { extractStackOverflowMetadata } = await import(
          "@/lib/utils/link-metadata-stackoverflow"
        );
        const soMetadata = await extractStackOverflowMetadata(url);
        if (soMetadata && soMetadata.title) {
          return prioritizeMetadata(soMetadata, soMetadata.ogUrl || url);
        }
      } catch {
        // Fallback to generic extraction on failure
      }
    }

    // X (Twitter) links: dedicated extractor in case you later
    // decide to enrich with authenticated API data.
    if (isXUrl(url)) {
      try {
        const { extractXMetadata } = await import(
          "@/lib/utils/link-metadata-x"
        );
        const xMetadata = await extractXMetadata(url);
        if (xMetadata && xMetadata.title) {
          return prioritizeMetadata(xMetadata, xMetadata.ogUrl || url);
        }
      } catch {
        // Fallback to generic extraction on failure
      }
    }

    // Check if this is a YouTube URL and use the dedicated extractor
    // for richer, YouTube-specific metadata.
    if (isYouTubeUrl(url)) {
      try {
        const { extractYouTubeMetadata } = await import(
          "@/lib/utils/link-metadata-youtube"
        );
        const youtubeMetadata = await extractYouTubeMetadata(url);
        if (youtubeMetadata && youtubeMetadata.title) {
          return prioritizeMetadata(youtubeMetadata, youtubeMetadata.ogUrl || url);
        }
      } catch {
        // If the YouTube-specific extractor fails for any reason,
        // gracefully fall back to the generic HTML-based extractor.
      }
    }

    // Validate and normalize URL
    let fetchUrl = url.trim();
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = `https://${fetchUrl}`;
    }

    // Fetch with timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

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
        // Limit response size to prevent memory issues
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Limit HTML size to prevent memory issues (first 500KB should be enough for metadata)
      const contentLength = response.headers.get("content-length");
      let html: string;
      
      if (contentLength && parseInt(contentLength, 10) > 500000) {
        // For large files, only read the first 500KB
        const reader = response.body?.getReader();
        if (reader) {
          const chunks: Uint8Array[] = [];
          let totalLength = 0;
          const maxLength = 500000;

          while (totalLength < maxLength) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalLength += value.length;
            if (totalLength >= maxLength) break;
          }
          reader.cancel();
          
          // Combine chunks manually
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          
          html = new TextDecoder().decode(combined);
        } else {
          html = await response.text();
        }
      } else {
        html = await response.text();
      }
      const metadata = extractMetadataFromHtml(html, response.url || fetchUrl);

      return prioritizeMetadata(metadata, response.url || fetchUrl);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error("Error fetching metadata for URL:", url, error);
    // Return minimal metadata with URL as title and a best-effort favicon
    try {
      const formattedUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
      const urlObj = new URL(formattedUrl);
      return {
        title: urlObj.hostname.replace(/^www\./, ""),
        // Use the normalized URL when deriving the favicon so we don't fail
        // on inputs without an explicit protocol (e.g. example.com).
        favicon: extractFaviconFromUrl(formattedUrl),
      };
    } catch {
      return {
        title: url,
      };
    }
  }
}

/**
 * Prioritize metadata sources: Open Graph > Twitter Card > Meta tags > JSON-LD > Title tag
 */
function prioritizeMetadata(metadata: LinkMetadata, url: string): LinkMetadata {
  // Use the best available title
  const title = metadata.ogTitle || metadata.twitterTitle || metadata.title || undefined;
  
  // Use the best available description
  const description = metadata.ogDescription || metadata.twitterDescription || metadata.description || undefined;
  
  // Use the best available image
  const image = metadata.ogImage || metadata.twitterImage || metadata.image || undefined;
  
  // Resolve image URL if needed
  const resolvedImage = image ? resolveUrl(image, url) : undefined;

  return {
    title,
    description,
    image: resolvedImage,
    favicon: metadata.favicon,
    ogTitle: metadata.ogTitle,
    ogDescription: metadata.ogDescription,
    ogImage: metadata.ogImage ? resolveUrl(metadata.ogImage, url) : undefined,
    ogType: metadata.ogType,
    ogUrl: metadata.ogUrl || url,
    ogSiteName: metadata.ogSiteName,
    twitterTitle: metadata.twitterTitle,
    twitterDescription: metadata.twitterDescription,
    twitterImage: metadata.twitterImage ? resolveUrl(metadata.twitterImage, url) : undefined,
    twitterCard: metadata.twitterCard,
    author: metadata.author,
    keywords: metadata.keywords,
  };
}
