/**
 * Link utility functions
 * URL validation, normalization, and helper functions for links
 */

/**
 * Validate if a string is a valid URL
 */
export function validateUrl(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    // Try adding https:// if no protocol
    try {
      const urlWithProtocol = `https://${url}`;
      new URL(urlWithProtocol);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Normalize URL for duplicate detection
 * Removes protocol, www, trailing slashes, query params, fragments, default ports
 */
export function normalizeUrl(url: string): string {
  try {
    // Add protocol if missing
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }

    const urlObj = new URL(normalized);

    // Remove protocol
    let host = urlObj.hostname;
    // Remove www. prefix
    if (host.startsWith("www.")) {
      host = host.substring(4);
    }

    // Remove default ports
    let port = urlObj.port;
    if (port === "80" || port === "443" || port === "") {
      port = "";
    } else {
      port = `:${port}`;
    }

    // Get pathname, remove trailing slash
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    // Combine: host + port + pathname (lowercase)
    const result = `${host}${port}${pathname}`.toLowerCase();

    return result;
  } catch {
    // If URL parsing fails, return lowercase version without protocol
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  }
}

/**
 * Check if two URLs are duplicates (after normalization)
 */
export function areUrlsDuplicate(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    let urlToParse = url;
    if (!urlToParse.startsWith("http://") && !urlToParse.startsWith("https://")) {
      urlToParse = `https://${urlToParse}`;
    }
    const urlObj = new URL(urlToParse);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[0].replace(/^www\./, "");
  }
}

/**
 * Generate favicon URL using Google's favicon service
 */
export function getFaviconUrl(url: string): string {
  try {
    const domain = extractDomain(url);
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

/**
 * Auto-detect link type from URL
 */
export function getLinkTypeFromUrl(url: string): "WEBSITE" | "FILE" | "DOCUMENT" | "VIDEO" | "IMAGE" | "OTHER" {
  const lowerUrl = url.toLowerCase();

  // Image extensions
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(lowerUrl)) {
    return "IMAGE";
  }

  // Video extensions
  if (/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i.test(lowerUrl)) {
    return "VIDEO";
  }

  // Document extensions
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|ods|odp)$/i.test(lowerUrl)) {
    return "DOCUMENT";
  }

  // File extensions (other)
  if (/\.(zip|rar|7z|tar|gz|exe|dmg|deb|rpm)$/i.test(lowerUrl)) {
    return "FILE";
  }

  // Video hosting sites
  if (
    /(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv)/i.test(lowerUrl)
  ) {
    return "VIDEO";
  }

  // Default to website
  return "WEBSITE";
}

/**
 * Format URL to ensure it has a protocol
 */
export function formatLinkUrl(url: string): string {
  if (!url) return "";

  const trimmed = url.trim();

  // If already has protocol, return as is
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Add https:// by default
  return `https://${trimmed}`;
}

/**
 * Check if a URL is a YouTube link
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return /(youtube\.com|youtu\.be)/i.test(lowerUrl);
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  try {
    // Handle youtu.be short URLs
    const youtuBeMatch = url.match(/(?:youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (youtuBeMatch) {
      return youtuBeMatch[1];
    }

    // Handle standard YouTube URLs with v parameter
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get("v");
    if (videoId) {
      return videoId;
    }

    // Handle embed URLs: youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
      return embedMatch[1];
    }

    // Handle v URLs: youtube.com/v/VIDEO_ID
    const vMatch = url.match(/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/);
    if (vMatch) {
      return vMatch[1];
    }

    return null;
  } catch {
    // If URL parsing fails, try regex directly
    const regexMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return regexMatch ? regexMatch[1] : null;
  }
}

/**
 * Check if a URL is a Wikipedia article
 */
export function isWikipediaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const normalized = url.trim();
    const withProtocol =
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`;
    const u = new URL(withProtocol);
    return /\.wikipedia\.org$/i.test(u.hostname);
  } catch {
    // Fallback to a simple hostname check if URL parsing fails
    return /wikipedia\.org/i.test(url);
  }
}

