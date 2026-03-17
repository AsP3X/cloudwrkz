import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import sharp from "sharp";

export type CacheFaviconOptions = {
  /** Request timeout in ms. Use a longer value (e.g. 10000) for client-provided URLs that may be slow. */
  timeoutMs?: number;
};

/**
 * Cache a favicon image locally under /public/uploads/favicons and return
 * the public URL (e.g. /uploads/favicons/favicon-abc123.png).
 *
 * If the URL is already pointing to a local uploads path, it is returned as-is.
 * If fetching or saving fails, null is returned and callers should fall back
 * to the original URL.
 */
export async function cacheFavicon(
  faviconUrl: string,
  options?: CacheFaviconOptions
): Promise<string | null> {
  if (!faviconUrl) return null;

  // Already a local uploads URL – no need to cache again.
  if (faviconUrl.startsWith("/uploads/")) {
    return faviconUrl;
  }

  const timeoutMs = options?.timeoutMs ?? 5000;

  try {
    let fetchUrl = faviconUrl.trim();
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      // We can't reliably fetch protocol-relative or relative URLs here,
      // so just skip caching in that case.
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/*,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok || !response.body) {
        return null;
      }

      // Use a stable hash of the favicon URL so we don't store duplicates
      // for the same URL.
      const hash = crypto.createHash("sha1").update(fetchUrl).digest("hex").slice(0, 16);
      // Normalize all cached favicons to PNG for consistent handling
      // across the web app and native apps.
      const filename = `favicon-${hash}.png`;

      const uploadsDir = join(process.cwd(), "public", "uploads", "favicons");
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);
      const filepath = join(uploadsDir, filename);

      try {
        // Convert any supported input (png, jpg, svg, ico, etc.) to PNG.
        const pngBuffer = await sharp(originalBuffer)
          .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        await writeFile(filepath, pngBuffer);
      } catch {
        // If conversion fails, do not cache; let callers fall back
        // to the original remote favicon URL.
        return null;
      }

      return `/uploads/favicons/${filename}`;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

