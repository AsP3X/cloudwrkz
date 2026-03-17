import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

/**
 * GET /uploads/favicons/:filename
 *
 * Serves cached favicon images from public/uploads/favicons/.
 *
 * Next.js standalone output does NOT serve the public/ directory automatically,
 * so this route handler makes favicons accessible without authentication.
 * This is needed for the iOS app's AsyncImage which loads favicons without
 * session cookies.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize: only allow simple filenames (alphanumeric, hyphens, dots)
  if (!/^[\w.-]+$/.test(filename)) {
    return new NextResponse(null, { status: 400 });
  }

  const filepath = join(process.cwd(), "public", "uploads", "favicons", filename);

  if (!existsSync(filepath)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = await readFile(filepath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "ico"
          ? "image/x-icon"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "svg"
              ? "image/svg+xml"
              : "application/octet-stream";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
