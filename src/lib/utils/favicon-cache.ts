import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import crypto from "crypto";

/**
 * Cache a favicon image locally under /public/uploads/favicons and return
 * the public URL (e.g. /uploads/favicons/favicon-abc123.png).
 *
 * If the URL is already pointing to a local uploads path, it is returned as-is.
 * If fetching or saving fails, null is returned and callers should fall back
 * to the original URL.
 */
export async function cacheFavicon(faviconUrl: string): Promise<string | null> {
  if (!faviconUrl) return null;

  // Already a local uploads URL – no need to cache again.
  if (faviconUrl.startsWith("/uploads/")) {
    return faviconUrl;
  }

  try {
    let fetchUrl = faviconUrl.trim();
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      // We can't reliably fetch protocol-relative or relative URLs here,
      // so just skip caching in that case.
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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

      const contentType = response.headers.get("content-type") || "";
      let extension = "ico";
      if (contentType.includes("png")) extension = "png";
      else if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = "jpg";
      else if (contentType.includes("gif")) extension = "gif";
      else if (contentType.includes("webp")) extension = "webp";
      else if (contentType.includes("svg")) extension = "svg";

      // Use a stable hash of the favicon URL so we don't store duplicates
      // for the same URL.
      const hash = crypto.createHash("sha1").update(fetchUrl).digest("hex").slice(0, 16);
      const filename = `favicon-${hash}.${extension}`;

      const uploadsDir = join(process.cwd(), "public", "uploads", "favicons");
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filepath = join(uploadsDir, filename);

      await writeFile(filepath, buffer);

      return `/uploads/favicons/${filename}`;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

